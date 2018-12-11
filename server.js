const express = require("express");
const exp = express();
const port = 8080;//����˼����˿�
const server = require("http").createServer(exp);
const io = require("socket.io").listen(server);
const axios = require("axios");
const secret = "6LdSpUAUAAAAAKkS_4bojjF16mhzoPXXIsyZdN8j";//reCAPTCHA ˽Կ

var users = [];//���б��Ͽɵ��û��б�
var nonHalalName = ["admin", "root", "null", "undefined"];//����ʹ�õ��ǳ�
exp.use("/", express.static(__dirname + "/html"));//���ʵľ�̬��Դ·��
server.listen(port);//��ʼ����
console.log(getNowTime() + "Server is running at port : " + port);

users.remove = function (item) {//ɾ���û�
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

io.on("connection", function (socket) {//����io��
    let nowUser = Object.create(user);
    var lastTime = 0;//�ϴη�����Ϣʱ�䣨���룩
    var thisTime = 0;//���η�����Ϣʱ�䣨���룩
    var date = null;//ʱ�����

    socket.on("login", function (newUser, verifyCode) {//�û������¼�
        /*
        ��֤��ַ�� https://recaptcha.net/recaptcha/api/siteverify

        ���ؽ����
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
                    if (isExists(newUser.name)) {//����ǳƴ���
                        socket.emit("loginStatus", "nameExisted");//���ش���
                        console.log(getNowTime() + "User '" + newUser.name + "' join fail (name existed)");
                    } else if (nonHalalName.indexOf(newUser.name.toLowerCase()) > -1) {//����ǳ��ڽ�ֹʹ���б���
                        socket.emit("loginStatus", "nameNonHalal");//���ش���
                        console.log(getNowTime() + "User '" + newUser.name + "' join fail (name non halal)");
                    } else if (newUser.name.length > 20) {//����ǳƳ��ȴ���20
                        socket.emit("loginStatus", "nameTooLong");//���ش���
                        console.log(getNowTime() + " User '" + newUser.name + "' join fail (name too long)");
                    } else {
                        nowUser.init(newUser);
                        users.push(nowUser);//�����м��뵱ǰ�û���Ϣ
                        socket.emit("loginStatus", "success");//���سɹ�
                        io.sockets.emit("user", nowUser.name, "login");//�㲥�����û�����
                        io.sockets.emit("flushUsers", users);//�㲥��ǰ�û��б�
                        console.log(getNowTime() + "User '" + nowUser.name + "' join success");
                    }
                } else {
                    console.log(getNowTime() + " User '" + newUser.name + "' join fail (" + response.data["error-codes"]+")");
                    socket.emit("loginStatus", "verifyFail");//���ش���
                }
            })
            .catch(function (response) {
                console.log(getNowTime() + "[ERROR]Here's an error when connected to reCAPTCHA");
                socket.emit("loginStatus", "verifyFail");//���ش���
            });
    });

    socket.on("disconnect", function () {//�û��뿪�¼�
        if (nowUser.name) {//�û�����Ϊ��ʱ
            io.sockets.emit("user", nowUser.name, "left");//�㲥���û��뿪
            users.remove(nowUser);//������ɾ�����û�;
            io.sockets.emit("flushUsers", users);//�㲥��ǰ�û��б�
            console.log(getNowTime() + "User '" + nowUser.name + "' left");
        }
    });

    socket.on("text", function (content, color) {//�û���Ϣ�����֣��¼�
        if (nowUser.name) {//�û�����Ϊ��
            date = new Date();
            thisTime = date.getTime();//��ȡ�˴η���ʱ��
            if (thisTime - lastTime >= 1000 ) {//��Ϣ�������1000����
                if (content.length <= 1000) {//��ϢС��1000���ַ�
                    io.sockets.emit("textMessage", nowUser, content, color);//�㲥
                    console.log(getNowTime() + nowUser.name + " : " + content);
                } else {
                    socket.emit("msgTooLong");//������Ϣ�����Ĵ���
                }
                lastTime = date.getTime();//�����ϴη���ʱ��
            } else {
                socket.emit("userTooFast");//�����������Ĵ���
            }
        }
    });

    socket.on("image", function (content) {//�û���Ϣ��ͼƬ���¼� 
        if (nowUser.name) {//�û�����Ϊ��

            date = new Date();
            thisTime = date.getTime();//��ȡ�˴η���ʱ��
            if (thisTime - lastTime >= 1000) {//��Ϣ�������1000����
                if (countImageSize(content) <= 400) {//ͼƬС��400KB
                    io.sockets.emit("imageMessage", nowUser, content);//�㲥
                    console.log(getNowTime() + nowUser.name + " : [image (" + countImageSize(content) + "KB) ]");
                } else {
                    socket.emit("imageTooLarge");//����ͼƬ����Ĵ���
                }

                lastTime = date.getTime();//�����ϴ���Ϣ����ʱ��
            } else {
                socket.emit("userTooFast");//�����������Ĵ���
            }
        }
    });
});

function isExists(name) {//�ж��û����Ƿ��Ѵ���
    name = name.toLowerCase();
    for (let i = 0; i < users.length; i++) {
        let temp = users[i].name.toLowerCase();
        if (temp == name) {
            return true;
        } 
    }
    return false;
} 

function countImageSize(base64) {//����base64�������ͼƬ��С������ƫ��
    return (base64.length - (base64.length / 8) * 2) / 1000;
}

function getNowTime() {//��ȡ��ǰʱ�䣬��ʽΪ XXXX-XX-XX XX:XX:XX
    date = new Date();
    return "[" + (date.getFullYear() + "-" + (date.getMonth() > 9 ? date.getMonth() : "0" + (date.getMonth() + 1 )) + "-" + (date.getDate() > 9 ? date.getDate() : "0" + date.getDate())) + " " + (date.getHours() > 9 ? date.getHours() : "0" + date.getHours()) + ":" + (date.getMinutes() > 9 ? date.getMinutes() : "0" + date.getMinutes()) + ":" + (date.getSeconds() > 9 ? date.getSeconds() : "0" + date.getSeconds()) + "] ";
}