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
    mainWindow.webContents.once('did-finish-load', () => {
        mainWindow.show();
        mainWindow.maximize();
        mainWindow.setFullScreen(true)
    });
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
                contextIsolation: true,
                preload: path.join(__dirname, 'preload.js')
            },
        });
        customerWindow.loadURL("http://localhost:5100/#/pos/customer");
        customerWindow.setFullScreen(true)
        windows.push(customerWindow)
    } else {
        console.log("No secondary display detected.");
    }
});

const openDrawer = async () => {
    const printWindow = new BrowserWindow({ show: false });
    const html = `<html><body><style>@page{size:auto;margin:0mm;height:1px}</style></body></html>`;
  
    printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    printWindow.webContents.on("did-finish-load", () => {
        printWindow.webContents.print({ silent:true }, (success, error) => {
            if (!success || error) { 
                if (error) console.error('Error writing to file:', error)
            };
            printWindow.close();
        });
    });
};

ipcMain.on('draw-cash', async () => openDrawer());

ipcMain.on('relaunch', () => {
    app.relaunch()
    app.exit()
})

ipcMain.on('reload', (event, content) => {
    windows.forEach( win => {
        if(win) {
            if(content.manual) {
                win.webContents.send('data-received', { manual:true })
            } else {
                win.webContents.send('data-received', {reload:true, products:content})
            }
        }
    })
})

ipcMain.on('close-window', () => {
    mainWindow.close()
    windows.forEach(w => w.close())
})

ipcMain.on("print-content", (event, content) => {
    const printWindow = new BrowserWindow({ show: false });
    const html = `<html><style> @page{ size:auto; margin:-5mm 3mm 3mm 2mm; }
        *{font-weight:400!important;text-transform:uppercase}
        .row> * {
            flex-shrink: 0;
            max-width:100%;
            padding-right:calc(30px * .5);
            padding-left:0;
            align-items:center;
            margin-top:0;
        }
        .row{padding:0px 10px!important;min-height:10px!important;border:0px!important}
        .row p:nth-child(2){margin-bottom:1px!important}
        .receipt {border-top:1px dashed!important;border-bottom:1px dashed!important}
        .toHide {display:none!important}
     </style>
    <body style="width:32%!important;margin:0px!important;padding:0px!important;">
        <div style="background-color: white; padding-bottom:4px;">
            <div style="display:flex;">
                <div style="justify-content:center;text-align:center;width:100%;display:grid">
                    <img src="data:image/png;base64,${b64}" alt="" height="100"/>
                </div>
            </div>
            ${content.html}
            <p>Generated: ${new Date().toLocaleString()}</p>
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
        const svg = await bwipjs.toSVG({
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
                <div style="width:28%;margin-left:-30px;" >${svg}</div>
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
