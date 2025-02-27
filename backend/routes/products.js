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

let error = { status : false, message:'Something went wrong!' }

const normalizeSpaces = (str) => str.replace(/\s+/g, ' ').trim()

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
            'pos',
            'category_id'
        ];

        if (req.body.category_id && req.body.category_id !== 'all') {
            products = await Product.query().where('category_id', req.body.category_id).orderBy('quantity', 'desc').select(cols).withGraphFetched().modifyGraph('category', (builder) => {
                builder.select(
                  'product_categories.name as catName'
                );
            });
        } else {
            products = await Product.query().orderBy('id', 'desc').select(cols).withGraphFetched('category').modifyGraph('category', (builder) => {
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
router.post('/create', [upload.single('image'), fetchuser ], async(req, res) =>{
    try { 

        if(req.body.barcode) {
            const existing = await Product.query().where('code',req.body.barcode).first()
            if(existing) {
                return res.json({status:false, message:"This barcode already exists!"});
            }
        }
        const payload = {
            name: req.body.name,
            price: req.body.price??0,
            code: req.body.barcode?? null,
            category_id: req.body.category_id,   
        }
        const category = await ProductCategory.query().where('id', req.body.category_id).first();
        if(req.file)
        {
            const {filename} = req.file;
            const updatedFilename = `${Date.now()}-${filename.slice(0,-5)}.webp`;

            const outputPath = path.join('tmp/products', updatedFilename.replace(/\s+/g, '').trim());
    
            await sharp(req.file.path)
            .resize(400,400, {
                fit: 'inside'
            })
            .webp({ quality:50 })
            .toFile(outputPath);
            fs.unlinkSync(req.file.path);
            payload.image = `products/`+ updatedFilename.replace(/\s+/g, '').trim();
        }

        const product = await Product.query().insertAndFetch(payload);

        return res.json({status:true, message:"Product added successfully!", product: category? {...product, catName: category.name}: product }); 

    } catch (e) {
        console.log(e.message)
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
            let path=null
            if(row.Images){
                path = await downloadAndProcessImage(row.Images)
                path = 'products/'+path;
            }

            await Product.query().insertGraph({
                code: row.Barcode,
                name: row.Name,
                type: row['Product Type'],
                price: row['Sales Price'],
                sales_desc: row['Sales Description'],
                image: path,  // Use the uploaded path or the default image from Excel
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
        if((req.body.catName)?.toLowerCase().indexOf('vege') && !req.body.code) return res.json({status:false, message:"Barcode can't be empty!"});
        const product = await Product.query().where('code', req.body.code).where('id','!=', req.body.id );
        if(req.body.code && product.length ) {
            return res.json({status:false, message:"This barcode already exists!"});
        }
        const body = {
            name: req.body.name,
            price:req.body.price,
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
            if(req.body.image!== 'null') {
                if (fs.existsSync(path.join(__dirname,`../tmp/${req.body.image}`))) {
                    fs.unlinkSync(path.join(__dirname,`../tmp/${req.body.image}`))
                }
            }
            try {fs.unlinkSync(req.file.path)} catch (err){}
            body.image = `products/`+ updatedFilename.replace(/\s+/g, '').trim();
        }
        if(req.body.category_id) {
            body.category_id = req.body.category_id;
        }
        const updated = await Product.query().patchAndFetchById(req.body.id, body);
        return res.json({ status:true, updated }); 

    } catch (e) {
        console.log(e)
        error.message = e.message
        return res.status(500).json(error)     
    }
}); 

router.get('/remove/:id', fetchuser, async(req, res) =>{
    try { 
        // return res.json({ status:true, removed:{} }); 
        const product = await Product.query().findById(req.params.id);
        try {
            if(product.image && product.image!='null') {
                fs.unlinkSync(path.join(__dirname, '../tmp/'+ product.image))
            }
        } catch (error) {throw new Error("Failed to remove the image: "+error.message)}
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
        const P = await ProductCategory.query().findById(product.category_id).select(['name']).first();
        return res.json({status:true, product:{...product, catName:P?.name??null} });

    } catch (error) {
        console.log(error.message);
        return res.json({ status:false, product:{} }) 
    }
});

router.get(`/barcode/:code`, async(req, res) => {
    try {
        const product = await Product.query().where('code', req.params.code).first();
        return res.json({ status:product.id?true:false, product });
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
            code: req.body.barcode,
            quantity: req.body.quantity ?? 3000
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

            try { fs.unlinkSync(req.file.path); } catch (er) {}
            payload.image = `products/`+ updatedFilename.replace(/\s+/g, '').trim();
      
        }
        const product = await Product.query().insertAndFetch(payload);

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
        products = products.map( pr => {
            if(pr) pr = JSON.parse(pr)
            else pr = {}
            return pr
        })

        for (const line in products) {

            if (products[line]) { 
                const row = products[line];
                if(row && row.name && row.price){

                    let catName 
                    let category
                    if(row.category) {
                        catName = normalizeSpaces(row.category)
                        category = await ProductCategory.query().findOne({ name: catName });
                        if (!category) {
                            category = await ProductCategory.query().insert({ name: catName });
                        }
                    }
                    if(row.barCode) {
                        let product = await Product.query().where('code', row.barCode).first()
                        if(product) {
                            await Product.query().findById(product.id).patch({
                                name: row.name,
                                price: (row.price)?.replace(",", ".")??0,
                                category_id: category?.id??null,
                                quantity: 5000,
                                tax: row.tax
                            })
                        } else {
                            await Product.query().insertGraph({
                                code: row.barCode??null,
                                name: row.name,
                                type: null,
                                price: (row.price)?.replace(",", ".")??0,
                                sales_desc: null,
                                image: null,
                                category_id: category?.id ?? null,
                                tax: row.tax ?? null,  // Handle optional tax field
                                quantity: 10000
                            });                
                        }
                    } else {
                        await Product.query().insertGraph({
                            code: row.barCode??null,
                            name: row.name,
                            type: null,
                            price: (row.price)?.replace(",", ".")??0,
                            sales_desc: null,
                            image: null,
                            category_id: category?.id ?? null,
                            tax: row.tax ?? null,  // Handle optional tax field
                            quantity: 10000
                        });                
                    }

                }

            }
        }
       
        // res.status(200).send('Data successfully imported to the database!');
        return res.json({ status:true, message: 'Products successfully imported!', products : products.map( pr => pr.length? JSON.parse(pr): pr)}); 

    } catch (e) {
        error.message = e.message
        console.log(e)
        return res.status(500).json(error)     
    }
}); 

module.exports=router 