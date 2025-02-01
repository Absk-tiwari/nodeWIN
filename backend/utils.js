const normalizeSpaces = (str) => {
    return str.replace(/\s+/g, ' ').trim();
}

const getCurrentDate = () => {
    const date = new Date();
    const day = String(date.getDate()).padStart(2, '0'); // Add leading zero if needed
    const month = String(date.getMonth() + 1).padStart(2, '0'); // Months are 0-based
    const year = date.getFullYear();
  
    return `${day}-${month}-${year}`;
};

async function generatePdf(data){

    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            body { font-family: ${data.print ? "'IBM Plex Sans', sans-serif" : "cursive"}; }
            .chosen-product {align-items:center; min-height:80px; background-color: #fff;}
            .chosen-product .w-100{ justify-content: space-between; }
            .row.d-flex { justify-content:space-between; }
            @media (max-width:250px) {
                * { font-size: 10px; }
            }
            #receipt {
                width: calc(100vw + 6px);
                ${!data.print ? "border: 4px dashed gray; border-radius: 15px;" : ""}
            }
            .receipt { width:90%; background:#fff; margin-left:5%; }
            .head img { margin-left: calc(50% - 50px); }
            .head { border-bottom: 2px solid black; }
            .head p:first-child { border-bottom: 1px solid black; }
            .d-grid p { text-align: center; }
            .foot div:first-child { border-top: 1px dashed gray; }
            img { height:50px!important; width:100px!important; }
            .total { display: flex; justify-content: space-between; }
            .chosen-product { margin-top: 10px; }
            .chosen-product .w-100 { display: flex; justify-content:space-between; margin: 0!important; padding: 0!important; }
            .chosen-product p:not(:nth-child(3)) { padding: 0; margin:0!important; }
            .chosen-product:nth-child(3) {border-top: 1px dashed gray; padding-top:10px; }
            .chosen-product:nth-child(1) {border-bottom: 1px dashed gray; padding-bottom:10px; }
            @page { margin:0px!important; }
            ${data.print ? `
            body {
                width: 110mm!important;
                margin:20 auto;
                font-family: 'DejaVu Sans', sans-serif;
            }
            ` : ""}
        </style>
    </head>
    <body>
        <div class="d-grid" style="place-content: center; width:100%;">
            <div id="receipt" style="width:auto; border-radius: 15px; border:3px dashed gray;">
                <div style="background-color: white; padding-bottom:40px; border-radius:15px;">
                    ${!data.print ? `
                    <div class="row">
                        <div class="d-grid text-center w-100 head" style="justify-content:center; width:100%;">
                            <img src="data:image/png;base64,${data.b64}" >
                            <p>${data.Rtype.toUpperCase()} - Report</p>
                        </div>
                    </div>` : `
                    <table style="width:100%">
                        <tbody>
                            <tr>
                                <td colspan="2" style="text-align:center;">
                                    <img src="data:image/png;base64,${data.b64}" >
                                </td>
                            </tr>
                            <tr>
                                <td colspan="2" style="text-align:center;">
                                    <h5 style="font-size:1.3rem; margin-top:10px; padding-top:10px;">
                                        ${data.Rtype.toUpperCase()} - Report
                                    </h5>
                                </td>
                            </tr>
                        </tbody>
                    </table>`}
                    <div class="row">
                        <div class="receipt">
                            <div class="row mt-2 chosen-product">
                                <table style="width: 100%; border-bottom:1px dashed gray;">
                                    <tbody>
                                        <tr><td><b>Report Date</b>:</td><td>${new Date().toLocaleDateString()}</td></tr>
                                        <tr><td><b>Report Time</b>:</td><td>${new Date().toLocaleTimeString()}</td></tr>
                                        <tr><td><b>Transactions</b>:</td><td>${data.number_of_transactions}</td></tr>
                                        <tr><td><b>Total Products</b>:</td><td>${data.total_products}</td></tr>
                                        <tr><td><b>Customers</b>:</td><td>${data.total_customers}</td></tr>
                                        <tr><td><b>Discounts</b>:</td><td>${data.currency}${data.discounts}</td></tr>
                                        <tr><td><b>Returns</b>:</td><td>${data.currency}${data.return_amount}</td></tr>
                                        <tr><td><b>Cash</b>:</td><td>${data.currency}${data.cash.toFixed(2)}</td></tr>
                                        <tr><td><b>Card</b>:</td><td>${data.currency}${data.card.toFixed(2)}</td></tr>
                                        <tr><td><b>Tax</b>:</td><td>${data.currency}${data.total_tax.toFixed(2)}</td></tr>
                                        <tr style="border-top:1px dashed gray">
                                            <td colspan="2"><b>Taxes</b></td>
                                        </tr>
                                        ${Object.entries(data.taxes).map(([type, value]) => `
                                        <tr>
                                            <td><b>${type}</b>:</td>
                                            <td>${value}</td>
                                        </tr>`).join('')}
                                    </tbody>
                                </table>
                                <br>
                                <b style="text-align:center">Department Sales</b>
                                <div class="row chosen-product mb-0">
                                    <table style="width: 100%;">
                                        <thead>
                                            <tr>
                                                <td><b>Type</b></td>
                                                <td><b>Quantity</b></td>
                                                <td><b>Amount</b></td>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            ${Object.entries(data.categories).reverse().map(([name, price]) => `
                                            <tr>
                                                <td>${name}:</td>
                                                <td>${data.qt[name] || ''}</td>
                                                <td>${data.currency}${price.toFixed(2)}</td>
                                            </tr>`).join('')}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                            <div class="foot">
                                <div class="row d-flex">
                                    <div class="total">
                                        <h2>TOTAL</h2>
                                        <h2>${data.currency}${data.total_amount.toFixed(2)}</h2>
                                    </div>
                                </div>
                                <div class="row d-flex mt-0">
                                    <div>
                                        <small>Generated On</small>
                                        <small>${new Date().toLocaleString()}</small>
                                    </div>
                                    <div>
                                        <small>By</small>
                                        <small>${data.userName} - Admin</small>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </body>
    </html>
    `;
}

module.exports = { normalizeSpaces, getCurrentDate, generatePdf };