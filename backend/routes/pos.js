const express = require("express");
const Product = require('../models/Product');
const CashierSession = require('../models/CashierSession');
const CashRegister = require('../models/CashRegister');
const router = express.Router();

const fetchuser= require('../middlewares/loggedIn');
const { getCurrentDate } = require("../utils");

router.get('/products/:img', fetchuser , async(req, res) => {

    let products;
    const cols = [
        'id',
        'name',
        'price',
        'code',
        'category_id',
        'weight',
        'sales_desc',
        'tax',
        'quantity'
    ];
    if(req.params.img!='false'){ 
        cols.push('image')
    }

    if (req.body.category_id && req.body.category_id !== 'all') {
        products = await Product.query().where('pos', true).where('category_id', req.body.category_id).orderBy('quantity', 'desc').select(cols).withGraphFetched().modifyGraph('category', (builder) => {
            builder.select(
                'product_categories.name as catName'
            );
        });
    } else {
        products = await Product.query().where('pos', true).orderBy('quantity', 'desc').select(cols).withGraphFetched('category').modifyGraph('category', (builder) => {
            builder.select(
                'product_categories.name as catName'
            );
        });
    }
    return res.json({ status:true, products: products.map(({ category, ...rest }) => ({ ...rest, catName: category ? category.catName : null })) })

});

// Route 3 : Get logged in user details - login required

router.post('/session', async(req, res)=> {
    const session_id = await CashierSession.query().where('cash_register_id', req.body.cash_register_id ).orderBy('id', 'desc').first()
    return res.json({ session : session_id.session_id + 1 })
});

router.post('/opening-day-cash-amount', async(req, res) => {
    try 
    {
        let created = await CashRegister.query().insert({
            opening_cash: req.body.cash,
            closing_cash: '0',
            date: getCurrentDate(),
            status: true,
            user_id: req.body.myID
        });
        return res.json({ status:true, created, message:"You can now start transactions!" });

    } catch (error) {
        return res.json({ status:false, message:error.message })
    }

});

module.exports=router 