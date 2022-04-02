// 2 bilpack
// https://github.com/jontewks/puppeteer-heroku-buildpack
// heroku/nodejs
const { Client,List, Buttons } = require('whatsapp-web.js');
const { MessageMedia } = require('whatsapp-web.js');
const axios = require('axios');
const puppeteer = require("puppeteer");
const express = require("express");

const app = express();
app.set("port", process.env.PORT || 5000);
let configuracion =[];
let conversaciones =[];
var evento_error = {};
var url_notificacion=process.env.URL_APP_SHEET||"https://script.google.com/macros/s/AKfycbx2q48P15JTo2D-Eu02K4ztO9saEYS7oF3uwU3eM8pupCVDJeo/exec";
// DEJAR PRENDIDO SERVER
setInterval(echotest, 300000);


//app.set("port", 9101);
app.use(express.json())

let client = null;
console.log("EMPEZO START");

async function inicializar() {
    console.log("INGRESO");
    const browserP = puppeteer.launch({
        args: ["--no-sandbox", "--disable-setuid-sandbox"],headless: true
      });    
    var browserWSEndpointP = await (await browserP).wsEndpoint();
    client = new Client({ puppeteer: { browserWSEndpoint:browserWSEndpointP}}); 
    console.log("TERMINO");

    client.on('qr', (qr) => {
        // Generate and scan this code with your phone
        console.log('QR RECEIVED', qr);
        (async () => {
            var response_end=  await axios.post(url_notificacion,{"op":"qr","qr":qr}).then((res) => {
                    return getStandardResponsePost(0, "OK",res.data);   
            }).catch(err => {
                    return getStandardResponsePost(1, err,{});   
            });
            console.log(JSON.stringify(response_end));
        })()
        .catch()
        .finally()
        ;
    
    });
    
    client.on(`authenticated`, (session) => {
        console.log('AUTHENTICATED', session);
    });
    
    client.on('ready', () => {
        console.log('Client is ready!');
        (async () => {
                var response_end=  await axios.post(url_notificacion,{"op":"conversacion"}).then((res) => {
                        return getStandardResponsePost(0, "OK",res.data);   
                }).catch(err => {
                        return getStandardResponsePost(1, err,{});   
                });
                configuracion=response_end.data.content;                
                for (let i = 0; i < configuracion.length; i++) {                    
                    for (let j = 0; j < configuracion[i].salida.length; j++) {
                        if(configuracion[i].salida[j].type==="url"){
                            var nombre_archivo = (configuracion[i].salida[j].mensaje).substring( (configuracion[i].salida[j].mensaje).lastIndexOf("/") + "/".length , (configuracion[i].salida[j].mensaje).length );
                            var response_axios =  await axios.get(configuracion[i].salida[j].mensaje, {
                                responseType: 'arraybuffer'
                                }).then((res) => {
                                    var mimetype = res.headers['content-type'];
                                    if(mimetype.includes(";")){
                                        mimetype=mimetype.split(";")[0];
                                    }    
                                    const buffer = Buffer.from(res.data, 'binary').toString('base64');
                                    return getStandardResponsePost(0, "OK",{base:buffer,type:mimetype}); 
                            }).catch(err => {
                                    return getStandardResponsePost(1, err,{});   
                            });
                            if(response_axios.code==0){
                                configuracion[i].salida[j].nombrearchivo=nombre_archivo;
                                configuracion[i].salida[j].base=response_axios.data.base;
                                configuracion[i].salida[j].mimetype=response_axios.data.type;
                            }
                        }        
                    }
                }

                console.log(JSON.stringify(configuracion));
                evento_error=configuracion.find((item) => item.evento === "Error"); 
        })()
        .catch()
        .finally()
        ;
    });
    
    client.on('message', msg => {
        (async () => {
        try
            {
                console.log("INGRESO MENSAJE MESSAGE");
                //console.log(msg);
                var mensaje_recibido = "";
                var documento_recibido = {};
                if(msg.type !== undefined && msg.type=="document"){ 
                    var media_document = await msg.downloadMedia();
                    documento_recibido.mimetype=media_document.mimetype;
                    documento_recibido.filename=media_document.filename;
                    documento_recibido.data=media_document.data;
                    mensaje_recibido="documento_send"
                }else{
                    mensaje_recibido=msg.body;
                }   
                var evento = configuracion.find((item) => item.entrada.split(";").includes(mensaje_recibido)); 
                console.log(evento);
                if(evento===undefined){
                    evento = evento_error;
                    for (let il = conversaciones.length-1; il >= 0; il--) {
                        if(conversaciones[il].numero===msg.from){
                            if(conversaciones[il].evento=="ListaPedido"){ // NO FROMA PARTE DEL CALCULO
                                continue;
                            }
                            var evento_retornar = configuracion.find((item) => conversaciones[il].retornar!="" && item.evento === conversaciones[il].retornar); 
                            if(evento_retornar!==undefined){
                                evento = evento_retornar;
                            }
                            break;   
                        }
                    }      
    
                }
                // SE AGREGA EL EVENTO  A LA CONVESACIOn
                conversaciones.push({numero:msg.from,mensaje:mensaje_recibido,evento:evento.evento,retornar:evento.retornar,documento:documento_recibido});
          
    //            console.log(evento);
                for (let il = 0; il < evento.salida.length; il++) {
                    if(evento.salida[il].type==="mensaje"){
                        client.sendMessage(msg.from,evento.salida[il].mensaje).then((r) => {
                        }).catch(err => {
                            console.log("ERROR EVENTO ", err);
                        });       
                    }else if(evento.salida[il].type==="details"){
                        var mensaje_details = evento.salida[il].mensaje+"\n";   
                        var detalle_subproducto = new Array("","","","","","","","","","","","","","","","","","","","","","","","","","","","");// SE NCIALIZA EN VACIO
                        for (let ill = 0; ill < evento.salida[il].lista.length; ill++) {
                            let result_details = conversaciones.filter(item => item.numero ===msg.from && item.evento===evento.salida[il].lista[ill].evento);
                            for (let ilm = 0 ; ilm < result_details.length; ilm++) {
                                detalle_subproducto[ilm]= detalle_subproducto[ilm]+result_details[ilm].mensaje+""+evento.salida[il].lista[ill].submensaje+ " ";
                            }
                        }
                        for (let ill = 0; ill < detalle_subproducto.length; ill++) {
                            if(detalle_subproducto[ill]===""){
                                break;
                            }
                            mensaje_details+= detalle_subproducto[ill].replace('\n', ' ')+"\n"; 
                        }
                        // SOLO PARA CASOS DONDE EXISTE UN DETALLE DE PEDIDOS SUBCALCULADOS
                        conversaciones.push({numero:msg.from,mensaje:mensaje_details,evento:"ListaPedido",retornar:"",documento:documento_recibido});          
                        client.sendMessage(msg.from,mensaje_details).then((r) => {
      //                      console.log("SEND EVENTO",r);
                        }).catch(err => {
                            console.log("ERROR EVENTO ", err);
                        });       
                    }else if(evento.salida[il].type==="lista"){
                        let sections = [{title:evento.salida[il].mensaje,rows:[]}];
                        let sections_ross = [];
                        for (let ill = 0; ill < evento.salida[il].lista.length; ill++) {
                          var row_lista={title:evento.salida[il].lista[ill].mensaje,description:evento.salida[il].lista[ill].submensaje};
                          sections[0].rows.push(row_lista);
                        }   
                        let list = new List(evento.salida[il].mensaje,evento.salida[il].submensaje,sections,null,null);
                        client.sendMessage(msg.from,list).then((r) => {
    //                        console.log("SEND MENSAJEE",r);
                        }).catch(err => {
                            console.log("ERROR MENSAJE ", err);
                        });
                    }else if(evento.salida[il].type==="boton"){
                        
                        var mensaje_end="";
                        
                        if(evento.evento==="EndSolicitarPedido" || evento.evento==="EndRequestOrder"){
                            // se invoca a AXIOS
                                let result_details = conversaciones.filter(item => item.numero ===msg.from);
                                var param_evento_end = {"op":"notificar","numero":msg.from,"pedido":result_details};
      //                          console.log(url_notificacion+"::::::::");
       //                         console.log(JSON.stringify(param_evento_end)+"::::::::");
                                var response_end=  await axios.post(url_notificacion,param_evento_end).then((res) => {
                                        return getStandardResponsePost(0, "OK",res.data);   
                                }).catch(err => {
                                        return getStandardResponsePost(1, err,{});   
                                });
        //                        console.log(JSON.stringify(response_end));
                                mensaje_end=response_end.data.codigoventa;
                        }else if(evento.evento==="EndConsultaPedido" || evento.evento==="EndQueryOrder"){
                            // se invoca a AXIOS
                                var param_evento_end = {"op":"buscar","codigo":mensaje_recibido,"evento":evento.evento};
         //                       console.log(JSON.stringify(param_evento_end)+"::::::::");
                                var response_end=  await axios.post(url_notificacion,param_evento_end).then((res) => {
                                        return getStandardResponsePost(0, "OK",res.data);   
                                }).catch(err => {
                                        return getStandardResponsePost(1, err,{});   
                                });
                                console.log(JSON.stringify(response_end));
                                mensaje_end=response_end.data.message;
                        }
    
                        
                        var evento_boton =[];
                        for (let ill = 0; ill < evento.salida[il].lista.length; ill++) {
                            evento_boton.push({body:evento.salida[il].lista[ill].mensaje});
                        }
                        let button = new Buttons(evento.salida[il].mensaje+mensaje_end,evento_boton,null,null);
                        client.sendMessage(msg.from,button).then((r) => {
                            console.log("SEND MENSAJEE",r);
                        }).catch(err => {
                            console.log("ERROR MENSAJE ", err);
                        });
                    }else if(evento.salida[il].type==="url"){
                        
                        var media = new MessageMedia(
                            evento.salida[il].mimetype, 
                            evento.salida[il].base,evento.salida[il].nombrearchivo
                            );
                            client.sendMessage(msg.from,media).then((r) => {
                                console.log("SEND MENSAJE",r);
                            }).catch(err => {
                                console.log("ERROR MENSAJE ", err);
                            });                           
                    }
    
                }
                // SE PONER LOS MENSJAES
                console.log("EVENTO"+evento.evento);
                if(evento.evento==="Start"){
                    var  result_numero = conversaciones.filter(item => item.numero !==msg.from);
                    console.log("numero "+result_numero.length+"----"+JSON.stringify(result_numero))
                    if(result_numero===undefined || result_numero.length==0){
                        conversaciones=[];    
                    }else{
                        conversaciones = result_numero;
                    }   
                }    
                console.log("conversaciones");
                console.log(JSON.stringify(conversaciones));
                
                if(mensaje_recibido==="fin"){
                    console.log("SET  FINALIZAE");
                    resolve("OK");
                }
    
            }catch(error){
                console.log('El error es : ', error);
            } 
        })()
        .catch()
        .finally()
        ;
    });
    client.initialize();

}
inicializar();
console.log("FIN START");

const getStandardResponsePost = async (code,message,data) => {
    return {
        code: code,
        message : message,
        data : data
     }
}

app.listen(app.get("port"), () => 
  console.log("app running on port", app.get("port"))
);  

async function echotest() {
    const date = new Date();
     console.log(date);
}
  
