const router = require("express").Router();
const User = require('../models/User');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Setting = require('../models/Setting');
const CashRegister = require('../models/CashRegister');
const CashierSession = require('../models/CashierSession');
const Notification = require('../models/Notification');
const fetchuser= require('../middlewares/loggedIn');
const { raw } = require('objection');
const Report = require('../models/Report');
const storage = require('../utils/storage'); // Utility to handle file storage
const { format } = require('date-fns');
const path = require('path');
const pdf = require('html-pdf');
const fs = require('fs');
const { generatePdf, getCurrentDate } = require('../utils');
const e = require("express");

const imgPath = path.join(__dirname,'../client/build/static/media/pos.5e6faa254498748a41be.png')

const b64 = fs.readFileSync(imgPath, 'base64');

let error = { status : false, message:'Something went wrong!' }

router.get('/', fetchuser , async(req, res) => {

    const orders = Order.query()
    .withGraphFetched('[customer(selectName), cashier(selectName)]')
    .modifiers({
      selectName(build) {
        build.select('id', 'name');
      },
    });

    let me = await User.query().where('id', req.body.myID ).first();
    if(me.type == 'admin') {
        orders.orderBy('id', 'desc'); 
    } else {
        orders.where('cashier_id', me.id ).orderBy('id', 'desc'); 
    }
    return res.json({status:true, orders:await orders });

});

router.post('/create', fetchuser, async(req, res) => 
{ 
    try {
        // Create the order
        const notifications = []
        const order = await Order.query().insert({
            session_id: req.body.session_id,
            amount: req.body.amount,
            ref_no: Math.floor(100000000000 + Math.random() * 899999999999),
            customer_id: req.body.customer_id?? 0,
            payment_mode: req.body.payment_mode,
            transaction_type: req.body.transaction_type,
            cashier_id: req.body.myID,
            created_at: new Date().toISOString()
        });
        console.log(format(new Date().toISOString(), 'yyyy-MM-dd'))
        if (!order) {
            throw new Error('Error creating order');
        }

        if (req.body.sessionData) {
            // Create the cashier session
            await CashierSession.query().insert({
                order_id: order.id,
                cashier_id: req.body.myID,
                session_id: req.body.session_id,
                cash_register_id: req.body.cash_register_id,
                data: req.body.sessionData,
            });

            const sessionData = req.body.sessionData;
            const minStock = await Setting.query().where('user_id', req.body.myID )
            .where('key', 'STOCK_ALERT')
            .first();

            for (const [productId, stock] of Object.entries(sessionData.quantity)) {
                
                if (productId === 'quick') continue;
                // decrement product stock
                const product = await Product.query().findById(productId).patch({
                    quantity: Product.raw('quantity - ?', [stock]),
                });

                // Check stock alert
                if (minStock) {
                    const prod = await Product.query()
                        .where('id', productId )
                        .select('quantity', 'name')
                        .first();

                    if ( prod.quantity < minStock.value ) {
                        try {
                            let inserted = await Notification.query().insertAndFetch({
                                content: `Stock named ${prod.name} is running out!`,
                                created_at: new Date().toISOString(),
                                user_id: req.body.myID
                            });
                            notifications.push(inserted)
                        } catch (error) {
                            console.error('Broadcast error:', error);
                        }
                    }
                }
            }
            return res.status(200).json({ status: true, message: 'Transaction completed!', html: req.body.receiptData, notifications });
        }

        return res.status(200).json({ status: false });

    } catch (error) {
        console.error('Transaction error:', error);
        res.status(500).json({ status: false, message: 'An error occurred', error: error.message });
    }
})
// Route 3 : Get logged in user details - login required
router.get('/view-order/:id', fetchuser, async(req, res) =>{
    try 
    {
        let orderID = req.params.id;
        let order = await Order.query().where('id', orderID ).withGraphFetched('cashier').first();
        const cashier = order.cashier;
        
        let session = await CashierSession.query().where('session_id', order.session_id ).where('order_id', order.id ).first().select('data');
        let data = JSON.parse(session.data)
        const products = await Product.query().whereIn( 'id', data.products );
        console.log(products)
        // return res.json({products});
        const pairs = {};
        products.forEach( product => {
            pairs[product.id] = product;
        });

        return res.json({
            status: true,
            order,
            products: pairs,
            session,
            cashier
        });

    } catch (e) {
        error.message = e.message;
        console.log(error.message);

        return res.json({
            status: false,
            order:{},
            products: [],
            session: [],
        }) 

    }
});

router.get(`/last-order`, async(req,res) => {
    try 
    {
        let order = await Order.query().orderBy('id', "DESC" ).withGraphFetched('cashier').first();
        const cashier = order.cashier;
        let session = await CashierSession.query().where('session_id', order.session_id ).where('order_id', order.id ).first().select('data');
        let data = JSON.parse(session.data)
        const products = await Product.query().whereIn( 'id', data.products );
        const pairs = {};
        products.forEach( product => {
            pairs[product.id] = product;
        });

        return res.json({
            status: true,
            order,
            products: pairs,
            session,
            cashier
        });

    } catch (e) {
        error.message = e.message;
        console.log(error.message);

        return res.json({
            status: false,
            order:{},
            products: [],
            session: [],
        }) 

    }
})

router.get(`/x-report`, fetchuser, async(req,res) => {
    try 
    {
        const payload = req.body;
        const {status, message} = await generateReport({...payload, type:'X'})
        res.json({ status, message });
    } catch (error) {
        res.json({status:false, message:error.message});
    }
});

router.post(`/z-report`, fetchuser, async(req,res) => {
    try {
        const payload = req.body;
        const {status, message, html} = await generateReport({...payload, type:'Z'})
        if(status){
            // todo update CashRegister modal status=false where id = payload.register_id
            // 
            if(payload.register_id) {
                await CashRegister.query().where('id', payload.register_id).patch({
                    status:false
                });
            }
        }
        res.json({ status, message, html})
    } catch (error) {
        console.log(error)
        res.json({status: false, message:error.message })
    }    
})


async function generateReport(payload) {

    let totalProducts = 0, total = 0, returns = 0, tax = 0, cash = 0, card = 0;
    let customers = [];
    let categories = { 'Others': 0 };
    let Rtype = payload.type;

    let orders;
    if (payload.today) {
        if(payload.register_id){
            orders = await Order.query()
                .join('cashier_sessions as cs', 'orders.id', 'cs.order_id')
                .where(raw('DATE(created_at)'), (new Date().toISOString()).split('T')[0])
                .where('cs.cash_register_id', payload.register_id)
                .select('*');
        } else {
            orders = await Order.query()
                .join('cashier_sessions as cs', 'orders.id', 'cs.order_id')
                .where(raw('DATE(created_at)'), (new Date().toISOString()).split('T')[0])
                .select('*');
        }
    } else {
        orders = await Order.query()
            .join('cashier_sessions as cs', 'orders.id', 'cs.order_id')
            .whereBetween(raw('DATE(created_at)'), [payload.from, payload.to])
            .select('*');
    }
    
    let taxes = {}, qt = {};
    // all below calculations just to obtain the data;
    for (const order of orders) {
        let orderData = JSON.parse(order.data);
        if (!customers.includes(order.customer_id) && order.customer_id) customers.push(order.customer_id);
        total += orderData.total;

        let products = Array.from(new Set(orderData.products));
        let QT = orderData.quantity;
        let quickProduct = orderData.otherAmount || null;

        for (const id of products) {
            if (id === 'quick') {
                categories['Others'] += quickProduct;
                qt['Others'] = (qt['Others'] || 0) + QT[id];
                continue;
            }

            let product = await Product.query()
                .withGraphFetched('category')
                .findById(id)
                .select('category_id', 'price', 'tax');

            if (product?.tax) {
                let [value, type] = product.tax.split(' ');
                if (!taxes[type??'Other']) taxes[type??'Other'] = value;
            }

            if (!product?.category) {
                categories['Others'] += product.price * QT[id];
                qt['Others'] = (qt['Others'] || 0) + QT[id];
            } else {
                categories[product.category.name] = (categories[product.category.name] || 0) + (product.price * QT[id]);
                qt[product.category.name] = (qt[product.category.name] || 0) + QT[id];
            }
        }

        totalProducts += Object.values(QT).reduce((sum, qty) => sum + qty, 0);

        let finalTax = await Product.query()
            .whereIn('id', products)
            .select(raw('tax / 100 * price as final'));

        tax += finalTax.reduce((sum, item) => sum + parseFloat(item.final), 0);

        if (order.payment_mode === 'Cash') {
            cash += orderData.total;
        } else if (order.payment_mode === 'Card') {
            card += orderData.total;
        }

        if (order.transaction_type !== 'credit') {
            returns += 1;
        }
    }
    let me = await User.query().where('id', payload.myID ).first();
    let registerCash = await CashRegister.query().where('id', payload.register_id??0 ).first();
    // now we have the meta-data
    let data = {
        total_products: totalProducts,
        total_customers: customers.length,
        return_amount: returns,
        total_tax: tax,
        total_amount: parseFloat(total),
        cash: parseFloat(cash),
        card: parseFloat(card),
        discounts: 0.00,
        number_of_transactions: orders.length,
        categories,
        taxes,
        qt,
        Rtype,
        print: false,
        currency: payload.currency,
        userName: me.name,
        b64,
        register:{
            open: registerCash?.opening_cash??0 ,
            close: payload.currency+ payload.closing_cash??0
        }
    };

    let view = await generatePdf(data); // Pass data to a template renderer
    const options = { format: 'A4' };

    if (Rtype === 'Z') {

        let alreadyGen = await Report.query()
            .orderBy('id', 'DESC')
            .select(raw("DATE(date) as date"))
            .first();

        if (alreadyGen && alreadyGen.date === format(new Date(), 'yyyy-MM-dd')) {
            return { message: 'Z-report already created for the day!', status: false };
        }

        data.print = true;

        let path = `reports/${format(new Date(), 'dd_MM_yyyy')}_Z_report.pdf`;
        
        pdf.create(view, options).toBuffer(async(err, fileBuffer) => {
            if (err) {
                console.error(err);
            } else {
                // console.log('PDF generated successfully:', buffer);
                await storage.put(path, fileBuffer);
            }
        });

        await Report.query().insert({
            path,
            date: format(new Date(), 'yyyy-MM-dd')
        });
        
    } 
    
    return { 
        status: true,  
        html: view, 
        message: Rtype==='Z'? 'Z-report generated! All sessions are reset now':"X-report generated!"
    };
    
}


module.exports=router 