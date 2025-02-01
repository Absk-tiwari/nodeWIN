const express = require("express");
const ProductCategory = require('../models/ProductCategory');
const Product = require('../models/Product');
const XLSX = require('xlsx');
const axios = require('axios');
const sharp = require('sharp');
const url = require('url');
const path = require('path');
const router = express.Router();
const fs = require('fs');

const fetchuser = require('../middlewares/loggedIn');
const upload = require('../middlewares/multer');
const { buffer } = require("stream/consumers");

let error = { status : false, message:'Something went wrong!' }

const normalizeSpaces = (str) => {
    return str.replace(/\s+/g, ' ').trim();
}

router.get('/', async (req,res) => {
    try {
        let products;
        const cols = [
            'id',
            'name',
            'price',
            'code',
            'weight',
            'tax',
            'sales_desc',
            'image',
            'quantity',
            'pos'
        ];

        if (req.body.category_id && req.body.category_id !== 'all') {
            products = await Product.query().where('category_id', req.body.category_id).orderBy('quantity', 'desc').select(cols).withGraphFetched().modifyGraph('category', (builder) => {
                builder.select(
                  'product_categories.name as catName'
                );
            });
        } else {
            products = await Product.query().orderBy('quantity', 'desc').select(cols).withGraphFetched('category').modifyGraph('category', (builder) => {
                builder.select(
                  'product_categories.name as catName'
                );
            });
        }
        return res.json({ status:true, products: products.map( item => {
            if(item.category) {
                item.catName = item.category.catName
                delete item.category
            }
            return item
        }) })

    } catch (e) {
        console.log("exception occured: ",e)
        error.message = e.message
        return res.status(400).json(error)        
    }
});

router.post(`/updateStock/:id`, async (req, res)=> {
    try {
        const updated =  await Product.query().patchAndFetchById(req.params.id, {
            quantity: req.body.quantity
        });

        return res.json({status:true, message:'Stock updated!', product:updated }); 

    } catch (error) {
        return res.json({status:false, message:"Something went wrong!"});
    }
});

// Route 3 : Get logged in user details - login required
router.post('/create', fetchuser, async(req, res) =>{
    try { 

        const tax = await Product.query().insert({
            // name: req.body.name,
            // amount: req.body.amount??0,
            // status: req.body.status??true,
        });

        return res.json({status:true, tax }); 

    } catch (e) {
        error.message = e.message
        return res.status(500).json(error)     
    }

}); 

router.post('/import', [ upload.single('file'), fetchuser ], async(req, res) => {
    try 
    { 
        const workbook = XLSX.readFile(req.file.path);
        const sheetName = workbook.SheetNames[0]; // Get the first sheet
        const sheetData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

        // await Product.query().truncate() // don't forget to remove this in prod
        // await ProductCategory.query().truncate();

        for (const row of sheetData) {
 
            const catName = normalizeSpaces(row['Product Categories'])
            let category = await ProductCategory.query().findOne({ name: catName });

            if (!category) {
                category = await ProductCategory.query().insert({ name: catName });
            }

            // Step 2: Find or create the product with the barcode
            let path = await downloadAndProcessImage(row.Images)
            path = 'products/'+path;

            await Product.query().insertGraph({
                code: row.Barcode,
                name: row.Name,
                type: row['Product Type'],
                price: row['Sales Price'],
                sales_desc: row['Sales Description'],
                image: path ?? row.Images,  // Use the uploaded path or the default image from Excel
                category_id: category.id ?? null,  // Associate with the category
                tax: row['Customer Taxes'] ?? null,  // Handle optional tax field
            });
        
        }
        // res.status(200).send('Data successfully imported to the database!');
        return res.json({status:true, message: 'Products successfully imported!' }); 

    } catch (e) {
        error.message = e.message
        return res.status(500).json(error)     
    }
}); 
 
router.post('/update', upload.single('uploaded'), async(req, res) =>{
    try { 
        const product = await Product.query().where('code',req.body.code)
        if(product.length > 1) {
            return res.json({status:false, message:"This barcode already exists!"});
        }
        const body = {
            name: req.body.name,
            price:req.body.amount,
            tax: req.body.tax,
            code: req.body.code,
        }
        if(req.file) {
            const {filename} = req.file;
            const updatedFilename = `${Date.now()}-${filename.slice(0,-5)}.webp`;

            const outputPath = path.join('tmp/products', updatedFilename.replace(/\s+/g, '').trim());
    
            await sharp(req.file.path)
            .resize(400,400, {
                fit: 'inside'
            })
            .webp({ quality:50 })
            .toFile(outputPath);
 
            fs.unlinkSync(`tmp/${req.body.image}`);
            fs.unlinkSync(req.file.path);
            body.image = `products/`+ updatedFilename.replace(/\s+/g, '').trim();
  
        }
        if(req.body.category_id) {
            body.category_id = req.body.category_id;
        }
        const updated = await Product.query().patchAndFetchById(req.body.id, body);
        return res.json({ status:true, updated, body: req.body }); 

    } catch (e) {
        console.log(e)
        error.message = e.message
        return res.status(500).json(error)     
    }
}); 

router.get('/remove/:id', fetchuser, async(req, res) =>{
    try { 
        // return res.json({ status:true, removed:{} }); 
        const removed = await Product.query().deleteById(req.params.id);
        if( removed ) {
            return res.json({ status:true, removed, message:'Product removed' }); 
        } else {
            return res.json({status:false, removed, message:'Failed to remove!' }); 
        }
    } catch (e) {
        error.message = e.message
        return res.status(500).json(error)     
    }
}); 

async function downloadAndProcessImage(imageUrl) {
    try {
        const response = await axios({
            method: 'get',
            url: imageUrl,
            responseType: 'arraybuffer', // Get image data as a buffer
        });

        const imageBuffer = Buffer.from(response.data, 'binary');
        
        const parsed = url.parse(imageUrl);
        let fileName = path.basename(parsed.pathname);
        fileName = fileName.split('.')[0]+'.webp';
        // Use sharp to resize and reduce quality (e.g., 80% quality)
        await sharp(imageBuffer)
        .resize(400, 400, {
            fit: 'inside',
        })
        .webp({ quality: 35 })
        .toFile(path.join('tmp/products', fileName));
        // .resize(800)  // Resize width to 800px (optional)
        // .jpeg({ quality: 40 })  // Reduce quality to 80%
        // .toFile(path.join('tmp/products', fileName));  // Save the image locally
        return fileName;
    
    } catch (error) {
        console.error('Error downloading or processing the image:', error.message);
        return imageUrl;
    }

}

router.get(`/update-product-pos/:id/:status`, async(req, res)=> {
    try 
    {
        const {id,status} = req.params;
        await Product.query().findById(id).patch({
            pos: status
        });
        let product = await Product.query().where('id', id).select(['id','name','image','price','quantity','category_id','sales_desc','code']).first()
        const {name} = await ProductCategory.query().findById(product.category_id).select(['name']).first();
        return res.json({status:true, product:{...product, catName:name} });

    } catch (error) {
        console.log(error.message);
        return res.json({ status:false, product:{} }) 
    }
});

router.get(`/barcode/:code`, async(req, res) => {
    try {
        const product = await Product.query().where('code', req.params.code).first();
        return res.json({status:product.length, product});
    } catch (error) {
        return res.json({status:false, product:{}});   
    }
})

router.post('/convert', async(req, res) => {
    const resp = axios({
        method:"GET",
        url: req.body.image,
        responseType:'arraybuffer'
    });

    const imageBuffer = Buffer.from(resp.data, 'binary');
        

    let fileName = path.basename();
    fileName = fileName.split('.')[0]+'.webp';

    // Use sharp to resize and reduce quality (e.g., 80% quality)
    await sharp(imageBuffer)
    .resize(400, 400, {
        fit: 'inside',
    })
    .webp({ quality: 35 })
    .toFile(path.join('tmp/converted', fileName ));
    return res.json({status:true});
});

router.post(`/create-custom`, upload.single('image'), async(req,res) => {
    try {
        const payload = {
            name: req.body.name,
            price: req.body.price,
            code: req.body.barcode
        }
        const existing = await Product.query().where('code', req.body.barcode).first();
        if(existing) {
            return res.json({
                status:false, 
                message:"A product with this barcode already exists!", 
                product:{}
            });
        }
        if(req.file){ 
 
            const {filename} = req.file;
            const updatedFilename = `${Date.now()}-${filename.slice(0,-5)}.webp`;

            const outputPath = path.join('tmp/products', updatedFilename.replace(/\s+/g, '').trim());
    
            await sharp(req.file.path)
            .resize(400,400, {
                fit: 'inside'
            })
            .webp({ quality:50 })
            .toFile(outputPath);
    
            fs.unlinkSync(`tmp/${req.body.image}`);
            fs.unlinkSync(req.file.path);
            body.image = `products/`+ updatedFilename.replace(/\s+/g, '').trim();
      
        }
        const product = await Product.query().insert(payload);

        res.json({status:true, message:"Product has been added!", product})
    } catch (error) {
        console.log(`exception while syncing: `+error.message)
        return res.json({status:false, message:error.message, product:{}})
    }
})

router.post('/sync', [ upload.single('file'), fetchuser ], async(req, res) => {
    try 
    { 
        const data = fs.readFileSync(req.file.path, 'utf-8');
        let products = data.split('\n');
        products = products.map( pr => pr.length? JSON.parse(pr): pr)

        for (const line in products) {

            if (products[line]) { 
                const row = products[line];
                
                if(row){

                    let catName 
                    if(row.category) {
                        catName = normalizeSpaces(row.category)
                    }
                    let category = await ProductCategory.query().findOne({ name: catName });
    
                    if (!category) {
                        category = await ProductCategory.query().insert({ name: catName });
                    }
                    let product = await Product.query().where('code', row.barCode).first()
                    if(product) {
                        await Product.query().findById(product.id).patch({
                            name: row.name,
                            price: (row.price).replace(",", "."),
                            category_id: category.id,
                            quantity: row.quantity,
                            tax: row.tax
                        })
                    } else {
                        await Product.query().insertGraph({
                            code: row.barCode?? row.name,
                            name: row.name,
                            type: null,
                            price: (row.price).replace(",", "."),
                            sales_desc: null,
                            image: null,
                            category_id: category.id ?? null,
                            tax: row.tax ?? null,  // Handle optional tax field
                            quantity: row.quantity
                        });                
                    }

                }

            }
        }
       
        // res.status(200).send('Data successfully imported to the database!');
        return res.json({ status:true, message: 'Products successfully imported!', products : products.map( pr => pr.length? JSON.parse(pr): pr)}); 

    } catch (e) {
        error.message = e.message
        console.log(error.message)
        return res.status(500).json(error)     
    }
}); 

module.exports=router 