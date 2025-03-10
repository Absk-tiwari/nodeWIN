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
const { generatePdf } = require('../utils');

const imgPath = path.join(__dirname,'../client/build/static/media/logo.2d2e09f65e21f53b1f9f.png')

const b64 = fs.readFileSync(imgPath, 'base64');

let error = { status : false, message:'Something went wrong!' }

router.get('/', fetchuser , async(req, res) => {

    const orders = Order.query()
    .withGraphFetched('[cashier(selectName), session, register]')
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
        const notifications = [];
        const order = await Order.query().insert({
            session_id: req.body.session_id,
            amount: req.body.amount,
            payment_mode: req.body.payment_mode,
            transaction_type: req.body.transaction_type,
            cashier_id: req.body.myID,
            created_at: new Date().toISOString(),
            cash_register_id: req.body.cash_register_id
        });
        
        if (!order) {
            throw new Error('Error creating order');
        }

        if (req.body.sessionData) {
            // Create the cashier session
            let modes = req.body.modes
            if((req.body.payment_mode).indexOf(',') !==-1 ) {
                modes = {...req.body.sessionData, modes }
            } else {
                modes = req.body.sessionData
            }
            await CashierSession.query().insert({
                order_id: order.id,
                cashier_id: req.body.myID,
                session_id: req.body.session_id,
                cash_register_id: req.body.cash_register_id,
                data: modes,
            });

            await CashRegister.query().findById( req.body.cash_register_id ).patch({
                closing_cash: CashRegister.raw(`closing_cash + ?`, [ req.body.cashForDrawer ])
            });
            const sessionData = req.body.sessionData;
            const minStock = await Setting.query().where('user_id', req.body.myID )
            .where('key', 'STOCK_ALERT')
            .first();

            const INVENTORY_IS = await Setting.query().where('user_id', req.body.myID)
            .where('key','INVENTORY_IS')
            .first();
            for (const [productId, stock] of Object.entries(sessionData.quantity)) {
                
                if (productId === 'quick') continue;
                // decrement product stock if the inventory is on 
                if(!INVENTORY_IS || INVENTORY_IS.value ==='true') { // INVENTORY_IS.value == true
                    console.log(sessionData.price[productId])
                    if( sessionData.price[productId] > 0 ) {
                        await Product.query().findById(productId).patch({
                            quantity: Product.raw('quantity - ?', [stock]),
                        });
                    } else {
                        await Product.query().findById(productId).patch({
                            quantity: Product.raw('quantity + ?', [stock]),
                        });
                    }
                }

                // Check stock alert
                if (minStock && (!INVENTORY_IS || INVENTORY_IS.value ==='true')) { // iff INVENTORY IS ON
                    const prod = await Product.query()
                        .where('id', productId )
                        .select('quantity', 'name')
                        .first();

                    if ( prod.quantity < minStock.value ) {
                        try {
                            let inserted = await Notification.query().insertAndFetch({
                                content: `Stock ${prod.name} is running out!`,
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

router.post(`/x-report`, fetchuser, async(req,res) => {
    try 
    {
        const payload = req.body;
        const {status, message, html} = await generateReport({...payload, type:'X'})
        return res.json({ status, message, html });
    } catch (error) {
        return res.json({status:false, message:error.message});
    }
});

router.post(`/z-report`, fetchuser, async(req,res) => {
    try {
        const payload = req.body;
        const {status, message, html} = await generateReport({...payload, type:'Z'})
        if(status){
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

    let totalProducts = 0, total = 0, returns = 0, tax = 0, cash = 0, card = 0, account = 0, discounts = 0;
    let customers = [];
    let categories = {};
    let Rtype = payload.type;

    let orders;
    if (payload.today || Rtype==='Z') {
        if(payload.register_id){
            orders = await Order.query()
                .join('cashier_sessions as cs', 'orders.id', 'cs.order_id')
                .where('cs.cash_register_id', payload.register_id)
                .select('*');
        }
    } else {
        orders = await Order.query()
        .join('cashier_sessions as cs', 'orders.id', 'cs.order_id')
        .whereBetween(raw('STRFTIME("%Y-%m-%d",created_at)'), [payload.from, payload.to ? payload.to: today])
        .select('*'); // x-report always
    }
    let taxes = {}, qt = {};
    for (const order of orders) {
        let orderData = JSON.parse(order.data);
        if (!customers.includes(order.customer_id) && order.customer_id) customers.push(order.customer_id);
        // if(order.transaction_type==='credit') 
        // {
            let products = Array.from(new Set(orderData.products));
            total += orderData.total;
            let QT = orderData.quantity;
            let quickProduct = orderData.otherAmount || null;
            const sPrice = orderData.price || null

            for (const id of products) {
                if (id === 'quick') {
                    categories['Others'] = categories['Others'] ? categories['Others'] + parseFloat(quickProduct): parseFloat(quickProduct);
                    qt['Others'] = (parseFloat(qt['Others']) || 0) + QT[id];
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
                    categories['Others'] = categories['Others'] ? categories['Others'] + ((sPrice[id]??product.price) * QT[id]): ((sPrice[id]??product.price) * QT[id]);
                    qt['Others'] = (parseFloat(qt['Others']) || 0) + QT[id];
                } else {
                    categories[product.category.name] = (categories[product.category.name] || 0) + (sPrice?.[id]??product.price * QT[id]);
                    qt[product.category.name] = (parseInt(qt[product.category.name]) || 0 ) + QT[id];
                }
            }
    
            totalProducts += Object.values(QT).reduce((sum, qty) => sum + parseInt(qty), 0);
    
            let finalTax = await Product.query()
                .whereIn('id', products)
                .select(['tax','price','id']);
    
            let thisTax = finalTax.reduce((sum, item) => sum + (parseFloat(item.tax) / 100 * parseFloat(sPrice[item.id]??item.price)), 0);
            if(!isNaN(thisTax)) tax += thisTax;
            discounts += finalTax.reduce((a,b) => a + (sPrice[b.id] - b.price),0)
            if (order.payment_mode === 'Cash') {
                cash += orderData.total;
            } else if (order.payment_mode === 'Card') {
                card += orderData.total;
            } else if(order.payment_mode === 'Account') {
                account+= orderData.total;
            } else {
                if(orderData.modes) {
                    cash+= parseFloat(orderData.modes.Cash).toFixed(2)
                    card+= parseFloat(orderData.modes.Card).toFixed(2)
                    account+= parseFloat(orderData.modes.Account).toFixed(2)
                }
            }
        // } else {
            returns += Object.values(orderData.price).filter( _ => _ < 0 ).reduce((a,c)=> a + c,0)
        // }

    }
    let me = await User.query().where('id', payload.myID ).first();
    let registerCash = await CashRegister.query().where('id', payload.register_id??0 ).first();
    if(!registerCash && Rtype==='Z') throw new Error("Z-report generated already!")
    // now we have the meta-data
    let data = {
        total_products: totalProducts,
        total_customers: customers.length,
        return_amount: returns,
        total_tax: tax,
        total_amount: parseFloat(total),
        cash: parseFloat(cash),
        card: parseFloat(card),
        account: parseFloat(account),
        discounts,
        number_of_transactions: orders.length,
        categories,
        taxes,
        qt,
        Rtype,
        print: false,
        currency: payload.currency,
        userName: me.name,
        b64
    };
    if(registerCash) {
        data.register = {
            open: registerCash?.opening_cash??0 ,
            close: payload.currency + registerCash.closing_cash??0
        }
    }
    // return data
    let view = await generatePdf(data); // Pass data to a template renderer
    const options = { format: 'A4' };

    if (Rtype === 'Z') {

        let alreadyGen = await Report.query()
            .orderBy('id', 'DESC')
            .select(raw("DATE(date) as date"))
            .first();

        if (alreadyGen && alreadyGen.date === (new Date().toISOString()).split('T')[0]) {
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
            date: new Date().toISOString()
        });
        
    } 
    
    return { 
        status: true,  
        html: view, 
        message: Rtype==='Z'? 'Z-report generated! Sessions are reset':"X-report generated!"
    };
    
}

router.get('/reports', async(req,res) => {
    try {
        const reports = await Report.query().orderBy('id','desc');
        return res.json({status:true, reports})
    } catch (error) {
        return res.json({status:false, reports:[]})
    }
})

router.get('/remove-report/:id', async(req,res)=> {
    try {
        const report = await Report.query().findById(req.params.id);
        try {
            if(fs.existsSync(path.join(__dirname,'../tmp/'+report.path))) {
                fs.unlinkSync(path.join(__dirname,'../tmp/'+report.path))
            }
        } catch (error) {throw new Error("Failed to remove the file:"+error.message)}
        await Report.query().deleteById(req.params.id)
        return res.json({status:true, message:"Report rempoved!"})
    } catch (error) {
        
    }
})
module.exports=router 