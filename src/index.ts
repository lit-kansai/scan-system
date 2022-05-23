import { FtpServer } from 'ftpd';
import fs from 'fs';
import path from 'path';
import axios from "axios";
import FormData from 'form-data'
import dotenv from 'dotenv';
import { PDFImage } from 'pdf-image';
import JSZip from 'jszip';

dotenv.config();

const port = 21;
const root = path.join(__dirname, '../images');

const server = new FtpServer('0.0.0.0', {
  getInitialCwd: () => '/',
  getRoot: () => root,
  pasvPortRangeStart: 1025,
  pasvPortRangeEnd: 1050,
  allowUnauthorizedTls: true,
})

//エラー
server.on('error', function(error) {
  console.log('FTP Server error:', error);
});

//クライアントが接続してきたら認証(してるフリ)
server.on('client:connected', connection => {
  let username: string | undefined = undefined;
  connection.on('command:user', (user: string, success: () => void, failure: () => void) => {
    if (user) {
      username = user;
      success();
    } else {
      failure();
    }
  });

  connection.on('command:pass', (pass: string, success: (username: string) => void, failure: () => void) => {
    if (username && pass) {
      success(username);
    } else {
      failure();
    }
  });

  connection.on('file:stor', async (event: string, data: {user: string, file: string, time: string} ) => {
    if(event == "close") {
      console.log(`${data.user} upload ${data.file}`);
      const filePath = path.join(__dirname, "../images", data.file);

      if(data.file.endsWith(".pdf")) {
        const pdfImage = new PDFImage(filePath, {
          convertOptions: {
            "-density": "200"
          }
        });
        const imagePaths = await pdfImage.convertFile();
        await sendImages(imagePaths);

      } else {
        const date = new Date()
        const filename = `${date.getFullYear()}${zeroPad(date.getMonth(), 2)}${zeroPad(date.getDate(), 2)}-${zeroPad(date.getHours(), 2)}${zeroPad(date.getMinutes(), 2)}${zeroPad(date.getSeconds(), 2)}`
        
        const formData = new FormData();
        formData.append('token', `${process.env.SLACK_TOKEN}`);
        formData.append('channels', `${process.env.SLACK_CHANNEL}`);
        formData.append('filename', `${filename}${path.extname(filePath)}`);
        formData.append('file', fs.readFileSync(filePath), { filename: `${filename}${path.extname(filePath)}` });

        await axios.post("https://slack.com/api/files.upload", formData, {
          headers: formData.getHeaders(),
          maxContentLength: Infinity,
          maxBodyLength: Infinity
        })
      }

      fs.rm(filePath, () => {});
    }
  });
});

async function sendImages(images: string[]) {
  const date = new Date()
  const filename = `${date.getFullYear()}${zeroPad(date.getMonth(), 2)}${zeroPad(date.getDate(), 2)}-${zeroPad(date.getHours(), 2)}${zeroPad(date.getMinutes(), 2)}${zeroPad(date.getSeconds(), 2)}`

  const zip = new JSZip()

  for(let i = 0; i < images.length; i++) {
    zip.file(`image${i}${path.extname(images[i])}`, fs.readFileSync(images[i]), {binary: true});
  }

  const formData = new FormData();
  formData.append('token', `${process.env.SLACK_TOKEN}`);
  formData.append('channels', `${process.env.SLACK_CHANNEL}`);
  formData.append('filename', `${filename}.zip`);
  formData.append('file', await zip.generateAsync({ type: "nodebuffer" }), { filename: `${filename}.zip` });

  await axios.post("https://slack.com/api/files.upload", formData, {
    headers: formData.getHeaders(),
    maxContentLength: Infinity,
    maxBodyLength: Infinity
  })
  for(let i = 0; i < images.length; i++) {
    fs.rm(images[i], () => {});
  }
}

function zeroPad(text: string | number, n: number) {
  return ('0'.repeat(n) + text).slice(-n);
}

//コンソールへの出力を最低限に
server.debugging = 0;

//指定したポートでサーバー起動
server.listen(port);
console.log('Listening on port ' + port);
