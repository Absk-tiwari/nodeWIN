const express = require("express");
const Category = require('../models/Category');
// const Currency = require('../models/Currency');
const router = express.Router();
const { body, validationResult }=require('express-validator')

const fetchuser= require('../middlewares/loggedIn');

let error = { status : false, message:'Something went wrong!' }
let output = { status : true }
  
router.get('/', async (req,res) => {
    try {  
        let categories = await Category.query();
        return res.json({status:true, categories });
    } catch (e) {
        console.log("exception occured: ",e)
        error.message = e.message
        return res.status(400).json(error)        
    }
});

// Route 3 : Get logged in user details - login required
router.post('/create', fetchuser, async(req, res) =>{
    try {  
        const category = await Category.query().insert({
            name: req.body.name,
            color: req.body.color??'#fff',
            status: req.body.status??true,
        });

        return res.json({status:true, category}); 

    } catch (e) {
        error.message = e.message
        return res.status(500).json(error)     
    }
}); 
 
router.post('/update', fetchuser, async(req, res) =>{
    try { 
        // return res.json({req: req.body})
        console.log(`id is hereL `+req.body.id)    
        await Category.query().findById(req.body.id).patch({
            name: req.body.name,
            color:req.body.color,
            status: req.body.status
        });

        return res.json({status:true, message:'Category updated successfully' }); 

    } catch (e) {
        error.message = e.message
        return res.status(500).json(error)     
    }
}); 

router.get('/remove/:id', fetchuser, async(req, res) =>{
    try { 

        const categoryDeleted = await Category.query().deleteById(req.params.id);
        if(categoryDeleted) {
            return res.json({status:true, categoryDeleted}); 
        } else {
            return res.json({status:false, categoryDeleted}); 
        }
    } catch (e) {
        error.message = e.message
        return res.status(500).json(error)     
    }
}); 

router.get('/toggle/:id/:status', async (req,res) => {
    try { 
        const category = await Category.query().patchAndFetchById(req.params.id, {
            status: req.params.status
        }); 
        return res.json({status:true, category, message: "Status updated!" });
    } catch (error) {
        return res.json({ status:false, category:{}, message: error.message, message: "Something went wrong!" })   
    }
})

module.exports=router 