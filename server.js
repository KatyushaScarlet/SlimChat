const express = require("express");
const exp = express();
const port = 8080;//服务端监听端口
const server = require("http").createServer(exp);
const io = require("socket.io").listen(server);
const axios = require("axios");
const secret = "6LdSpUAUAAAAAKkS_4bojjF16mhzoPXXIsyZdN8j";//reCAPTCHA 私钥

var users = [];//所有被认可的用户列表
var nonHalalName = ["admin", "root", "null", "undefined"];//不可使用的昵称
exp.use("/", express.static(__dirname + "/html"));//访问的静态资源路径
server.listen(port);//开始监听
console.log(getNowTime() + "Server is running at port : " + port);

users.remove = function (item) {//删除用户
    this.splice(this.indexOf(item), 1);
}

var user = {
    name: null,
    mail: null,
    url: null,
    init: function (item) {
        this.name = item.name;
        this.mail = item.mail;
        this.url = item.url;
    }
}

io.on("connection", function (socket) {//整个io流
    let nowUser = Object.create(user);
    var lastTime = 0;//上次发送消息时间（毫秒）
    var thisTime = 0;//本次发送消息时间（毫秒）
    var date = null;//时间对象

    socket.on("login", function (newUser, verifyCode) {//用户连接事件
        /*
        验证地址： https://recaptcha.net/recaptcha/api/siteverify

        返回结果：
        {
            "success": false,
            "error-codes": [
            "missing-input-response",
            "missing-input-secret"
            ]
        }
        */
        axios.post("https://recaptcha.net/recaptcha/api/siteverify?secret=" + secret + "&response=" + verifyCode)
            .then(function (response) {
                if (response.data["success"] === true) {
                    if (isExists(newUser.name)) {//如果昵称存在
                        socket.emit("loginStatus", "nameExisted");//返回错误
                        console.log(getNowTime() + "User '" + newUser.name + "' join fail (name existed)");
                    } else if (nonHalalName.indexOf(newUser.name.toLowerCase()) > -1) {//如果昵称在禁止使用列表中
                        socket.emit("loginStatus", "nameNonHalal");//返回错误
                        console.log(getNowTime() + "User '" + newUser.name + "' join fail (name non halal)");
                    } else if (newUser.name.length > 20) {//如果昵称长度大于20
                        socket.emit("loginStatus", "nameTooLong");//返回错误
                        console.log(getNowTime() + " User '" + newUser.name + "' join fail (name too long)");
                    } else {
                        nowUser.init(newUser);
                        users.push(nowUser);//数组中加入当前用户信息
                        socket.emit("loginStatus", "success");//返回成功
                        io.sockets.emit("user", nowUser.name, "login");//广播有新用户加入
                        io.sockets.emit("flushUsers", users);//广播当前用户列表
                        console.log(getNowTime() + "User '" + nowUser.name + "' join success");
                    }
                } else {
                    console.log(getNowTime() + " User '" + newUser.name + "' join fail (" + response.data["error-codes"]+")");
                    socket.emit("loginStatus", "verifyFail");//返回错误
                }
            })
            .catch(function (response) {
                console.log(getNowTime() + "[ERROR]Here's an error when connected to reCAPTCHA");
                socket.emit("loginStatus", "verifyFail");//返回错误
            });
    });

    socket.on("disconnect", function () {//用户离开事件
        if (nowUser.name) {//用户名不为空时
            io.sockets.emit("user", nowUser.name, "left");//广播有用户离开
            users.remove(nowUser);//数组中删除此用户;
            io.sockets.emit("flushUsers", users);//广播当前用户列表
            console.log(getNowTime() + "User '" + nowUser.name + "' left");
        }
    });

    socket.on("text", function (content, color) {//用户消息（文字）事件
        if (nowUser.name) {//用户名不为空
            date = new Date();
            thisTime = date.getTime();//获取此次发送时间
            if (thisTime - lastTime >= 1000 ) {//消息间隔大于1000毫秒
                if (content.length <= 1000) {//消息小于1000个字符
                    io.sockets.emit("textMessage", nowUser, content, color);//广播
                    console.log(getNowTime() + nowUser.name + " : " + content);
                } else {
                    socket.emit("msgTooLong");//返回消息过长的错误
                }
                lastTime = date.getTime();//更新上次发送时间
            } else {
                socket.emit("userTooFast");//返回输入过快的错误
            }
        }
    });

    socket.on("image", function (content) {//用户消息（图片）事件 
        if (nowUser.name) {//用户名不为空

            date = new Date();
            thisTime = date.getTime();//获取此次发送时间
            if (thisTime - lastTime >= 1000) {//消息间隔大于1000毫秒
                if (countImageSize(content) <= 400) {//图片小于400KB
                    io.sockets.emit("imageMessage", nowUser, content);//广播
                    console.log(getNowTime() + nowUser.name + " : [image (" + countImageSize(content) + "KB) ]");
                } else {
                    socket.emit("imageTooLarge");//返回图片过大的错误
                }

                lastTime = date.getTime();//更新上次消息发送时间
            } else {
                socket.emit("userTooFast");//返回输入过快的错误
            }
        }
    });
});

function isExists(name) {//判断用户名是否已存在
    name = name.toLowerCase();
    for (let i = 0; i < users.length; i++) {
        let temp = users[i].name.toLowerCase();
        if (temp == name) {
            return true;
        } 
    }
    return false;
} 

function countImageSize(base64) {//根据base64长度算出图片大小，稍有偏差
    return (base64.length - (base64.length / 8) * 2) / 1000;
}

function getNowTime() {//获取当前时间，格式为 XXXX-XX-XX XX:XX:XX
    date = new Date();
    return "[" + (date.getFullYear() + "-" + (date.getMonth() > 9 ? date.getMonth() : "0" + (date.getMonth() + 1 )) + "-" + (date.getDate() > 9 ? date.getDate() : "0" + date.getDate())) + " " + (date.getHours() > 9 ? date.getHours() : "0" + date.getHours()) + ":" + (date.getMinutes() > 9 ? date.getMinutes() : "0" + date.getMinutes()) + ":" + (date.getSeconds() > 9 ? date.getSeconds() : "0" + date.getSeconds()) + "] ";
}