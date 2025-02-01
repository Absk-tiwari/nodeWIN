const express = require("express");
const Setting = require('../models/Setting');
const Notification = require('../models/Notification');
const router = express.Router();
const fetchuser = require('../middlewares/loggedIn')

let error = { status : false, message:'Something went wrong!' }
  
router.get('/stock-alert', fetchuser, async(req, res) => {
    try {
        const alert = await Setting.query().where('key', "STOCK_ALERT").where('user_id', req.body.myID ).first();
        if(alert) {
            return res.json({status:true, stock: JSON.parse(alert.value)});
        } 
    } catch (error) {
        return res.json({status:false, alert:0})
    }
})
router.post('/update-stock-alert', fetchuser, async (req,res) => {
    try {  
        const alert = await Setting.query().where('key', "STOCK_ALERT").where('user_id', req.body.myID ).first();
        if(alert) {
            await Setting.query().where('user_id', req.body.myID).where('key', 'STOCK_ALERT').patch({
                value: req.body.stock
            });
            return res.json({status:true, message:"Stock alert updated!"});
        } 
        await Setting.query().insert({
            user_id: req.body.myID,
            key: "STOCK_ALERT",
            value: req.body.stock  
        });

        return res.json({status:true, message:"Stock alert created!" });

    } catch (e) {
        console.log("exception occured: ",e)
        error.message = e.message
        return res.status(400).json(error)        
    }
});


router.get('/clear-notifications', fetchuser, async(req,res) => {
    try {
        await Notification.query().where('user_id', req.body.myID).delete();
        return res.json({status:true})
    } catch (error) {
        console.log(error.message);
        return res.json({status:false})
    }
})

router.get('/notifications', fetchuser, async(req,res)=> {
    try {
        return res.json({status:true, notifications: await Notification.query().where('user_id', req.body.myID)})
    }catch (err) {
        console.log(err.message)
        return res.json({status:false, notifications:[]})
    }
})

router.get('/notification/delete/:id', async(req,res) => {
    try {
        await Notification.query().where('id',req.params.id).delete();
        return res.json({status:true})
    } catch (error) {
        return res.json({status:false})
    }
})

module.exports = router