import "server-only";
import net from "node:net";
import tls from "node:tls";
import { randomUUID } from "node:crypto";

type Socket = net.Socket | tls.TLSSocket;
function required(name: string): string { const value=process.env[name]?.trim(); if(!value) throw new Error(`SMTP_CONFIG_MISSING:${name}`); return value; }
function dotStuff(value:string){return value.replace(/\r?\n/g,"\r\n").replace(/^\./gm,"..");}
function headerSafe(value:string){return value.replace(/[\r\n]+/g," ").trim();}

async function waitResponse(socket: Socket): Promise<string> {
  return new Promise((resolve,reject)=>{
    let data=""; const onData=(chunk:Buffer|string)=>{data+=chunk.toString(); const lines=data.split(/\r\n/).filter(Boolean); const last=lines.at(-1)??""; if(/^\d{3} /.test(last)){cleanup(); resolve(data);}};
    const onError=(e:Error)=>{cleanup(); reject(e);}; const onClose=()=>{cleanup(); reject(new Error("SMTP_CONNECTION_CLOSED"));};
    const cleanup=()=>{socket.off("data",onData);socket.off("error",onError);socket.off("close",onClose);}; socket.on("data",onData);socket.on("error",onError);socket.on("close",onClose);
  });
}
async function command(socket:Socket,line:string,accepted:number[]){socket.write(line+"\r\n"); const response=await waitResponse(socket); const code=Number(response.slice(-5,-2))||Number(response.slice(0,3)); if(!accepted.includes(code)) throw new Error(`SMTP_${code}:${response.slice(0,240)}`); return response;}

export async function sendSmtpEmail(input:{to:string;subject:string;body:string}):Promise<{messageId:string}> {
  const host=required("OUTBOUND_SMTP_HOST"), user=required("OUTBOUND_SMTP_USER"), password=required("OUTBOUND_SMTP_PASSWORD"), from=required("OUTBOUND_FROM_EMAIL");
  const port=Number(process.env.OUTBOUND_SMTP_PORT ?? "465"); const secure=(process.env.OUTBOUND_SMTP_SECURE ?? "true").toLowerCase()!=="false";
  const socket:Socket = secure ? tls.connect({host,port,servername:host,rejectUnauthorized:true}) : net.connect({host,port});
  await waitResponse(socket); await command(socket,`EHLO salespilot`,[250]);
  if(!secure) throw new Error("SMTP_CONFIG_UNSUPPORTED:Use implicit TLS for R9");
  await command(socket,"AUTH LOGIN",[334]); await command(socket,Buffer.from(user).toString("base64"),[334]); await command(socket,Buffer.from(password).toString("base64"),[235]);
  await command(socket,`MAIL FROM:<${from}>`,[250]); await command(socket,`RCPT TO:<${input.to}>`,[250,251]); await command(socket,"DATA",[354]);
  const messageId=`<${randomUUID()}@${from.split("@")[1]||"salespilot.local"}>`; const fromName=headerSafe(process.env.OUTBOUND_FROM_NAME?.trim()||"MarketRoute");
  const message=[`From: ${fromName} <${from}>`,`To: <${headerSafe(input.to)}>`,`Subject: ${headerSafe(input.subject)}`,`Message-ID: ${messageId}`,`Date: ${new Date().toUTCString()}`,"MIME-Version: 1.0","Content-Type: text/plain; charset=UTF-8","Content-Transfer-Encoding: 8bit","",dotStuff(input.body),"."].join("\r\n");
  socket.write(message+"\r\n"); const response=await waitResponse(socket); if(Number(response.slice(0,3))!==250) throw new Error(`SMTP_SEND_FAILED:${response.slice(0,240)}`); await command(socket,"QUIT",[221]).catch(()=>undefined); socket.destroy(); return {messageId};
}
