const electron = require('electron')
const { app, BrowserWindow, screen } = require('electron');
const path = require('path');
const bwipjs = require('bwip-js');
const server = require('./backend/server');
const { ipcMain } = require("electron");
const fs = require('fs');
const imgPath = path.join(__dirname,'backend/client/build/static/media/logo.2d2e09f65e21f53b1f9f.png')
const b64 = fs.readFileSync(imgPath, 'base64');
// idVendor 8137
// idProduct 8214
let mainWindow;
let backendProcess;
let windows=[]

app.on('ready', () => 
{
    server.start();
    const { width, height } = electron.screen.getPrimaryDisplay().workAreaSize
    mainWindow = new BrowserWindow({
        width,
        height,
        devTools:false,
        autoHideMenuBar: true,
        scrollBounce:true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: true, // Prevent direct access to Node.js in the renderer
        },
    });
    
    mainWindow.loadURL('http://localhost:5100');
    mainWindow.webContents.once('did-finish-load', () => {mainWindow.show();mainWindow.maximize()});
    mainWindow.on('closed', () => {
        mainWindow = null;        
        if (backendProcess) backendProcess.kill();
    });


    const displays = screen.getAllDisplays();
    const customerDisplay = displays.length > 1 ? displays[1] : null;
    if (customerDisplay) {
        const customerWindow = new BrowserWindow({
            width: customerDisplay.size.width,
            height: customerDisplay.size.height,
            x: customerDisplay.bounds.x,
            y: customerDisplay.bounds.y,
            frame: false, // Optional: Hide the window frame for a cleaner look
            fullscreen: true, // Optional: Make it fullscreen on the display
            alwaysOnTop: true, // Optional: Keep it on top
            webPreferences: {
                nodeIntegration: true,
            },
        });
        customerWindow.loadURL("http://localhost:5100/#/pos/customer");
        windows.push(customerWindow)
    } else {
        console.log("No secondary display detected.");
    }
});

const openDrawer = async () => {};

ipcMain.on('draw-cash', async () => openDrawer());
ipcMain.on('reload', (event, content) => {
    windows.forEach( win => {
        if(win) win.webContents.send('data-received', {reload:true})
    })
})

ipcMain.on("print-content", (event, content) => {
    const printWindow = new BrowserWindow({ show: false });
    const html = `<html><style> @page{ size:auto; margin:2mm 3mm 3mm 2mm; }
        b, p, span{font-size:0.8rem!important}
        strong{font-size:0.75rem!important}
        .row> * {
            flex-shrink: 0;
            max-width:100%;
            padding-right:calc(30px * .5);
            padding-left:0;
            align-items:center;
            margin-top:0;
        }
        .row{padding:0px 15px!important;min-height:50px!important}
        .row p:nth-child(2){margin-bottom:1px!important}
     </style>
    <body style="width:32%!important;margin:0px!important;padding:0px!important;font-family:system-ui">
        <div style="background-color: white; padding-bottom: 10px; border-radius: 15px; font-size: larger;">
            <div style="display:flex;font-size:larger;">
                <div style="justify-content: center; text-align: center; width: 100%; display: grid;">
                    <img src="data:image/png;base64,${b64}" alt="" height="140"/>
                </div>
            </div>
            ${content.html}
        </div>
    </body></html>`;
  
    printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    printWindow.webContents.on("did-finish-load", () => {
        printWindow.webContents.print({ silent:true }, (success, error) => {
            if (!success || error) { 
                if (error) console.error('Error writing to file:', error)
            };
            printWindow.close();
        });
    });

});

ipcMain.on(`print-report`, async(event, html) => {
    try {
        const printWin = new BrowserWindow({ show:false });
        printWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
        printWin.webContents.on("did-finish-load", () => {
            printWin.webContents.print(
                { silent: true, printBackground: true },
                (success, errorType) => {
                    if (!success) console.error("Failed to print:", errorType);
                    printWin.close(); // Close the hidden window after printing
                }
            );
        });
    } catch (error) {
        console.log(error.message)
    }
})

ipcMain.on("generate-barcode", async (event, content)=> {
    try {
        const buffer = await bwipjs.toBuffer({
            bcid: "code128",
            text: content,
            scale: 2,
            height:10,
            includetext:true,
            textxalign:'center',
            textyalign:'center'
        });
        const printWindow = new BrowserWindow({ show: false }); // Hidden window
        const barcodeHTML = `
        <html>
            <style>@page{size:auto}</style>
            <body >
                <img src="data:image/png;base64,${buffer.toString("base64")}" style="width:28%;margin-left:-30px;" />
            </body>
        </html>
        `;
        printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(barcodeHTML)}`);

        printWindow.webContents.on("did-finish-load", () => {
            printWindow.webContents.print(
                { silent: true },
                (success, errorType) => {
                    if (!success) console.error("Failed to print:", errorType);
                    printWindow.close(); // Close the hidden window after printing
                }
            );
        });
    } catch (error) {
        console.log(error.message)
    }
})

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
