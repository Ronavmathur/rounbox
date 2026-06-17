const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(express.static(path.join(__dirname)));
const PORT = 3000;

// ========== GAME DATA ==========
const ITEMS = {
    dirt:{name:'Dirt',price:0.01,imgKey:'dirt',rarity:'common'},
    penny:{name:'Penny',price:0.01,imgKey:'penny',rarity:'common'},
    grass:{name:'Patch of Grass',price:0.01,imgKey:'grass',rarity:'common'},
    pizzabox:{name:'Empty Pizza Box',price:0.05,imgKey:'pizzabox',rarity:'common'},
    papers:{name:'Stack of Papers',price:0.05,imgKey:'papers',rarity:'common'},
    waterbottle:{name:'Water Bottle',price:0.10,imgKey:'waterbottle',rarity:'common'},
    pencil:{name:'Pencil',price:0.15,imgKey:'pencil',rarity:'common'},
    lightbulb:{name:'Light Bulb',price:0.25,imgKey:'lightbulb',rarity:'common'},
    thanksticker:{name:'Turkey Sticker',price:0.25,imgKey:'thanksticker',rarity:'common'},
    plate:{name:'Clean Plate',price:0.50,imgKey:'plate',rarity:'common'},
    legosticker:{name:'Lego Sticker',price:0.50,imgKey:'legosticker',rarity:'common'},
    bmwsticker:{name:'BMW Sticker',price:0.75,imgKey:'bmwsticker',rarity:'common'},
    rope:{name:'Rope',price:0.75,imgKey:'rope',rarity:'common'},
    duck:{name:'Rubber Duck',price:1.00,imgKey:'duck',rarity:'common'},
    dollar:{name:'1 Dollar Bill',price:1.00,imgKey:'1-dollar-bill',rarity:'common'},
    mousepad:{name:'Mousepad',price:1.50,imgKey:'mousepad',rarity:'common'},
    notebook:{name:'Old Notebook',price:1.50,imgKey:'notebook',rarity:'common'},
    usb:{name:'USB Drive',price:2.00,imgKey:'usbdrive',rarity:'common'},
    coffee:{name:'Cup of Coffee',price:3.00,imgKey:'coffee',rarity:'common'},
    shovel:{name:'Shovel',price:5.00,imgKey:'shovel',rarity:'common'},
    chair:{name:'Wooden Chair',price:5.00,imgKey:'chair',rarity:'common'},
    dice:{name:'Dice Set',price:8.00,imgKey:'dice',rarity:'rare'},
    ecigar:{name:'E-Cigarette',price:12.00,imgKey:'ecigar',rarity:'rare'},
    vintlamp:{name:'Vintage Lamp',price:15.00,imgKey:'vintlamp',rarity:'rare'},
    xylophone:{name:'Xylophone Toy',price:15.00,imgKey:'xylophone',rarity:'rare'},
    mouse:{name:'Gaming Mouse',price:20.00,imgKey:'mouse',rarity:'rare'},
    poseidon:{name:'Poseidon Figurine',price:25.00,imgKey:'poseidon',rarity:'rare'},
    basketball:{name:'Spalding Basketball',price:30.00,imgKey:'basketball',rarity:'rare'},
    greyhoodie:{name:'Grey Hoodie',price:35.00,imgKey:'greyhoodie',rarity:'rare'},
    chess:{name:'Chess Set',price:40.00,imgKey:'chess',rarity:'rare'},
    lolhoodie:{name:'LoL Hoodie',price:45.00,imgKey:'lolhoodie',rarity:'rare'},
    controller:{name:'Xbox Controller',price:69.99,imgKey:'controller',rarity:'epic'},
    keyboard:{name:'Mech Keyboard',price:120.00,imgKey:'keyboard',rarity:'epic'},
    airpods:{name:'AirPods',price:159.00,imgKey:'airpods',rarity:'epic'},
    nswitch:{name:'Nintendo Switch',price:299.99,imgKey:'switch',rarity:'epic'},
    iphone12:{name:'iPhone 12',price:399.00,imgKey:'iphone12',rarity:'epic'},
    bill500:{name:'$500 Bill',price:500.00,imgKey:'bill500',rarity:'epic'},
    camera:{name:'Sony ZV-1 Camera',price:650.00,imgKey:'camera',rarity:'epic'},
    ps5:{name:'PlayStation 5',price:499.99,imgKey:'ps5',rarity:'legendary'},
    iphone15:{name:'iPhone 15 Pro',price:999.00,imgKey:'iphone15',rarity:'legendary'},
    rtx:{name:'RTX 4090',price:1599.00,imgKey:'rtx',rarity:'legendary'},
    highpowerpc:{name:'Gaming PC',price:3500.00,imgKey:'highpowerpc',rarity:'legendary'},
    rolex:{name:'Rolex Watch',price:15000.00,imgKey:'rolex',rarity:'legendary'},
    gt86:{name:'Toyota GT86',price:28000.00,imgKey:'gt86',rarity:'legendary'},
    bmwx5:{name:'BMW X5',price:55000.00,imgKey:'bmwx5',rarity:'legendary'}
};

const CASES=[
    {id:'pennyflip',name:'Penny Flip',price:0.10,c1:'#52525b',c2:'#27272a',displayItems:['penny','dirt'],normal:[['penny',30],['dirt',22],['grass',18],['pizzabox',10],['papers',8],['waterbottle',5],['pencil',3],['lightbulb',2],['GOLD',2]],gold:[['dollar',35],['plate',25],['duck',20],['notebook',12],['bmwsticker',8]]},
    {id:'junkdrawer',name:'Junk Drawer',price:0.50,c1:'#92400e',c2:'#451a03',displayItems:['pizzabox','rope'],normal:[['dirt',16],['grass',12],['pizzabox',12],['waterbottle',9],['pencil',8],['penny',7],['papers',6],['lightbulb',5],['duck',4],['rope',4],['plate',3],['thanksticker',3],['legosticker',2],['GOLD',3]],gold:[['dollar',25],['coffee',22],['notebook',18],['mousepad',15],['usb',12],['shovel',8]]},
    {id:'dirtcheap',name:'Dirt Cheap',price:1.00,c1:'#6b7280',c2:'#374151',displayItems:['dirt','1-dollar-bill'],normal:[['dirt',22],['dollar',14],['penny',12],['grass',8],['mousepad',6],['waterbottle',5],['pencil',5],['duck',4],['usb',4],['lightbulb',3],['plate',3],['notebook',2],['rope',2],['GOLD',2]],gold:[['dice',25],['mouse',22],['ecigar',15],['shovel',12],['vintlamp',10],['poseidon',8],['basketball',5],['chess',3]]},
    {id:'stickerpack',name:'Sticker Pack',price:2.00,c1:'#14b8a6',c2:'#134e4a',displayItems:['legosticker','bmwsticker'],normal:[['legosticker',20],['bmwsticker',16],['thanksticker',14],['penny',10],['pencil',7],['duck',6],['lightbulb',5],['dirt',4],['papers',3],['waterbottle',3],['grass',2],['plate',2],['GOLD',3]],gold:[['dice',24],['poseidon',20],['xylophone',16],['ecigar',14],['mouse',12],['chess',8],['basketball',6]]},
    {id:'pocket',name:'Pocket Change',price:3.00,c1:'#22c55e',c2:'#14532d',displayItems:['1-dollar-bill','mousepad'],normal:[['dollar',16],['dirt',10],['mousepad',9],['usb',7],['penny',6],['coffee',5],['notebook',5],['duck',4],['pencil',4],['rope',3],['shovel',3],['lightbulb',2],['mouse',2],['GOLD',3]],gold:[['controller',24],['basketball',18],['greyhoodie',16],['chess',12],['ecigar',10],['vintlamp',8],['keyboard',5],['airpods',3]]},
    {id:'dollarstore',name:'Dollar Store',price:5.00,c1:'#eab308',c2:'#713f12',displayItems:['duck','coffee'],normal:[['dollar',12],['mousepad',9],['usb',8],['coffee',7],['notebook',6],['duck',5],['pencil',5],['shovel',5],['rope',4],['plate',4],['lightbulb',3],['vintlamp',3],['legosticker',3],['GOLD',3]],gold:[['mouse',24],['basketball',18],['greyhoodie',15],['chess',12],['poseidon',10],['ecigar',8],['keyboard',7],['lolhoodie',6]]},
    {id:'officeraid',name:'Office Raid',price:8.00,c1:'#64748b',c2:'#1e293b',displayItems:['pencil','notebook'],normal:[['pencil',14],['notebook',12],['papers',10],['coffee',8],['lightbulb',6],['plate',6],['mousepad',6],['usb',5],['chair',4],['vintlamp',3],['dollar',3],['rope',2],['duck',2],['GOLD',3]],gold:[['mouse',24],['chess',18],['greyhoodie',15],['keyboard',12],['basketball',10],['ecigar',8],['controller',7],['lolhoodie',6]]},
    {id:'hobbybox',name:'Hobby Box',price:15.00,c1:'#f97316',c2:'#7c2d12',displayItems:['dice','xylophone'],normal:[['dice',12],['duck',9],['xylophone',9],['poseidon',8],['legosticker',7],['rope',5],['coffee',5],['notebook',4],['vintlamp',4],['ecigar',3],['bmwsticker',3],['pencil',3],['GOLD',4]],gold:[['basketball',20],['chess',16],['mouse',14],['greyhoodie',12],['keyboard',10],['lolhoodie',8],['controller',6],['airpods',4]]},
    {id:'tech',name:'Tech Starter',price:25.00,c1:'#3b82f6',c2:'#1e3a8a',displayItems:['mouse','mousepad'],normal:[['mousepad',14],['usb',10],['dollar',7],['pencil',5],['coffee',5],['notebook',5],['lightbulb',4],['duck',3],['mouse',5],['vintlamp',3],['keyboard',3],['ecigar',2],['GOLD',4]],gold:[['controller',22],['basketball',16],['greyhoodie',14],['chess',12],['airpods',10],['lolhoodie',8],['poseidon',6],['iphone12',3]]},
    {id:'streetwear',name:'Streetwear Drop',price:35.00,c1:'#ec4899',c2:'#831843',displayItems:['greyhoodie','lolhoodie'],normal:[['bmwsticker',12],['legosticker',9],['rope',6],['duck',6],['ecigar',5],['dice',5],['coffee',4],['vintlamp',4],['notebook',3],['pencil',3],['thanksticker',3],['GOLD',4]],gold:[['greyhoodie',24],['lolhoodie',20],['basketball',14],['chess',12],['controller',10],['keyboard',8],['airpods',5],['poseidon',7]]},
    {id:'desk',name:'Desk Setup',price:50.00,c1:'#0ea5e9',c2:'#0c4a6e',displayItems:['mouse','keyboard'],normal:[['usb',12],['mousepad',10],['coffee',7],['chair',6],['pencil',5],['notebook',5],['lightbulb',4],['mouse',5],['vintlamp',3],['plate',3],['papers',3],['keyboard',3],['GOLD',4]],gold:[['greyhoodie',20],['lolhoodie',16],['basketball',14],['chess',12],['controller',10],['airpods',8],['iphone12',4],['camera',3]]},
    {id:'gamer',name:'Gamer Elite',price:150.00,c1:'#10b981',c2:'#064e3b',displayItems:['controller','switch'],normal:[['mouse',12],['dice',8],['ecigar',7],['usb',6],['mousepad',6],['keyboard',5],['duck',4],['coffee',3],['basketball',4],['greyhoodie',4],['vintlamp',3],['controller',3],['GOLD',5]],gold:[['airpods',20],['lolhoodie',16],['chess',12],['iphone12',12],['nswitch',10],['camera',8],['ps5',5],['bill500',4]]},
    {id:'creator',name:'Content Creator',price:200.00,c1:'#f43f5e',c2:'#881337',displayItems:['camera','iphone15'],normal:[['usb',12],['mousepad',8],['mouse',6],['coffee',5],['notebook',5],['ecigar',4],['dice',4],['keyboard',4],['greyhoodie',3],['vintlamp',3],['basketball',3],['GOLD',5]],gold:[['camera',24],['airpods',16],['iphone12',14],['nswitch',10],['iphone15',8],['bill500',6],['ps5',4],['highpowerpc',3]]},
    {id:'console',name:'Console Vault',price:300.00,c1:'#a855f7',c2:'#4c1d95',displayItems:['ps5','switch'],normal:[['keyboard',12],['mouse',9],['controller',8],['ecigar',6],['basketball',6],['greyhoodie',5],['vintlamp',4],['coffee',3],['lolhoodie',4],['chess',4],['airpods',3],['GOLD',5]],gold:[['nswitch',22],['iphone12',16],['ps5',14],['bill500',12],['camera',10],['iphone15',6],['rtx',4],['highpowerpc',2]]},
    {id:'luxury',name:'Flex Pack',price:500.00,c1:'#f59e0b',c2:'#78350f',displayItems:['rolex','ps5'],normal:[['controller',10],['basketball',8],['greyhoodie',7],['chess',6],['mouse',6],['keyboard',5],['ecigar',5],['lolhoodie',5],['airpods',4],['dice',3],['vintlamp',3],['coffee',2],['GOLD',6]],gold:[['ps5',20],['bill500',16],['nswitch',14],['camera',12],['iphone15',10],['rtx',6],['highpowerpc',4],['rolex',2]]},
    {id:'royale',name:'Jackpot Royale',price:1000.00,c1:'#ef4444',c2:'#7f1d1d',displayItems:['rolex','rtx'],normal:[['controller',10],['airpods',8],['keyboard',7],['basketball',7],['chess',6],['lolhoodie',5],['greyhoodie',5],['mouse',5],['nswitch',3],['iphone12',3],['dice',3],['ecigar',2],['GOLD',6]],gold:[['ps5',18],['bill500',16],['camera',14],['iphone15',12],['rtx',10],['highpowerpc',6],['gt86',3],['rolex',2]]},
    {id:'whale',name:"Whale's Paradise",price:2500.00,c1:'#ca8a04',c2:'#713f12',displayItems:['rtx','gt86'],normal:[['nswitch',12],['controller',10],['airpods',8],['keyboard',7],['iphone12',6],['lolhoodie',5],['chess',5],['basketball',5],['greyhoodie',4],['camera',3],['ecigar',3],['mouse',2],['GOLD',7]],gold:[['ps5',18],['bill500',14],['iphone15',12],['rtx',12],['highpowerpc',10],['gt86',5],['rolex',3],['bmwx5',1]]},
    {id:'diamond',name:'Diamond Reserve',price:5000.00,c1:'#60a5fa',c2:'#1e3a5f',displayItems:['highpowerpc','bmwx5'],normal:[['nswitch',10],['iphone12',8],['controller',8],['airpods',7],['keyboard',6],['ps5',5],['camera',5],['lolhoodie',4],['chess',4],['basketball',3],['greyhoodie',3],['bill500',3],['GOLD',8]],gold:[['iphone15',22],['rtx',18],['highpowerpc',16],['gt86',8],['rolex',5],['bmwx5',3]]},
    {id:'thevault',name:'The Vault',price:10000.00,c1:'#fbbf24',c2:'#1a1a2e',displayItems:['bmwx5','rolex'],normal:[['ps5',10],['nswitch',9],['iphone12',8],['camera',7],['controller',7],['airpods',6],['keyboard',5],['iphone15',4],['bill500',4],['lolhoodie',3],['chess',3],['basketball',2],['greyhoodie',2],['GOLD',10]],gold:[['rtx',22],['highpowerpc',20],['gt86',14],['rolex',10],['bmwx5',5]]}
];
const CASE_MAP={};CASES.forEach(c=>CASE_MAP[c.id]=c);

const FORMATS = {
    '1v1':     { maxPlayers:2, isTeam:false, teamSize:0 },
    '1v1v1':   { maxPlayers:3, isTeam:false, teamSize:0 },
    '1v1v1v1': { maxPlayers:4, isTeam:false, teamSize:0 },
    '2v2':     { maxPlayers:4, isTeam:true,  teamSize:2 },
    '3v3':     { maxPlayers:6, isTeam:true,  teamSize:3 }
};

function getItem(id){return{...ITEMS[id],id};}
function serverRand(){return crypto.randomBytes(4).readUInt32BE(0)/0xFFFFFFFF;}

function getDrop(caseObj,isGoldPool){
    const base=isGoldPool?caseObj.gold:caseObj.normal;
    const total=base.reduce((a,[,w])=>a+w,0);
    let rand=serverRand()*total;
    for(const[id,w]of base){if((rand-=w)<=0)return id==='GOLD'?{isToken:true}:getItem(id);}
    const last=base[base.length-1][0];
    return last==='GOLD'?{isToken:true}:getItem(last);
}

// ========== BATTLE STATE ==========
const BOT_NAMES=['Bot_Alex','Bot_Max','Bot_Luna','Bot_Nova','Bot_Kai','Bot_Zara','Bot_Finn','Bot_Ruby','Bot_Leo','Bot_Iris','Bot_Ash','Bot_Sky'];
const battles={};
const coinflips={};

function genId(prefix){return prefix+Date.now()+'_'+crypto.randomBytes(4).toString('hex');}
function pickBot(exclude){const avail=BOT_NAMES.filter(n=>!exclude.has(n));return avail.length?avail[Math.floor(serverRand()*avail.length)]:'Bot_'+Math.floor(serverRand()*9999);}

function generateResults(battle){
    const results={};
    battle.players.forEach(player=>{
        const items=[];
        battle.cases.forEach(caseId=>{
            const cObj=CASE_MAP[caseId];if(!cObj)return;
            const drop=getDrop(cObj,false);
            const finalItem=drop.isToken?getDrop(cObj,true):drop;
            items.push({caseId,item:finalItem});
        });
        results[player]={items,totalValue:items.reduce((s,r)=>s+r.item.price,0)};
    });
    return results;
}

function determineWinner(battle){
    const r=battle.results;const fmt=FORMATS[battle.format]||FORMATS['1v1'];
    let winner=null,winVal=0;

    if(fmt.isTeam){
        const ts=fmt.teamSize;
        const t1=battle.players.slice(0,ts);
        const t2=battle.players.slice(ts);
        const v1=t1.reduce((s,p)=>s+(r[p]?r[p].totalValue:0),0);
        const v2=t2.reduce((s,p)=>s+(r[p]?r[p].totalValue:0),0);
        if(battle.scoring==='crazy'){
            if(v1<=v2){winner=t1[0];winVal=v1;}else{winner=t2[0];winVal=v2;}
        }else{
            if(v1>=v2){winner=t1[0];winVal=v1;}else{winner=t2[0];winVal=v2;}
        }
    }else if(battle.scoring==='terminal'){
        battle.players.forEach(p=>{
            if(!r[p])return;
            const last=r[p].items[r[p].items.length-1];
            const lv=last?last.item.price:0;
            if(lv>winVal||!winner){winner=p;winVal=lv;}
        });
    }else if(battle.scoring==='crazy'){
        let lo=Infinity;
        battle.players.forEach(p=>{if(r[p]&&r[p].totalValue<lo){winner=p;lo=r[p].totalValue;winVal=lo;}});
    }else{
        battle.players.forEach(p=>{if(r[p]&&r[p].totalValue>winVal){winner=p;winVal=r[p].totalValue;}});
    }
    return{winner,winnerValue:winVal};
}

function startBattle(b){
    b.results=generateResults(b);
    const{winner,winnerValue}=determineWinner(b);
    b.winner=winner;b.winnerValue=winnerValue;b.status='playing';
}

function battleSummary(b){
    return{id:b.id,creator:b.creator,format:b.format,scoring:b.scoring,maxPlayers:b.maxPlayers,
        players:b.players,cases:b.cases,totalCost:b.totalCost,status:b.status,quickMode:b.quickMode,
        createdAt:b.createdAt,isTeam:b.isTeam,teamSize:b.teamSize,
        results:b.status==='playing'||b.status==='finished'?b.results:null,
        winner:b.winner,winnerValue:b.winnerValue};
}

function lobbyList(){
    const now=Date.now();const list=[];
    for(const id in battles){
        const b=battles[id];
        if(now-b.createdAt>3600000){delete battles[id];continue;}
        if(b.status==='finished'&&now-b.createdAt>300000)continue;
        list.push(battleSummary(b));
    }
    list.sort((a,b)=>b.createdAt-a.createdAt);return list;
}

function cfLobby(){
    const now=Date.now();const list=[];
    for(const id in coinflips){
        const c=coinflips[id];
        if(now-c.createdAt>600000){delete coinflips[id];continue;}
        if(c.status==='finished'&&now-c.createdAt>60000)continue;
        list.push(c);
    }
    list.sort((a,b)=>b.createdAt-a.createdAt);return list;
}

// ========== SOCKET.IO ==========
io.on('connection',(socket)=>{
    socket.emit('lobby:update',lobbyList());
    socket.emit('coinflip:lobby',cfLobby());

    // --- BATTLES ---
    socket.on('battle:create',(data,ack)=>{
        const{username,format,scoring,cases,quickMode}=data;
        if(!username||!cases||!cases.length)return ack({ok:false,msg:'Invalid data'});
        const fmt=FORMATS[format];if(!fmt)return ack({ok:false,msg:'Invalid format'});
        const validCases=cases.filter(id=>CASE_MAP[id]);
        if(!validCases.length)return ack({ok:false,msg:'No valid cases'});
        const totalCost=validCases.reduce((s,id)=>s+CASE_MAP[id].price,0);
        const id=genId('b_');
        battles[id]={id,creator:username,format,scoring:scoring||'normal',maxPlayers:fmt.maxPlayers,
            isTeam:fmt.isTeam,teamSize:fmt.teamSize,
            players:[username],cases:validCases,totalCost,status:'waiting',quickMode:!!quickMode,
            results:{},winner:null,winnerValue:0,createdAt:Date.now()};
        socket.join(id);
        ack({ok:true,battleId:id,totalCost,battle:battleSummary(battles[id])});
        io.emit('lobby:update',lobbyList());
    });

    socket.on('battle:addBot',(data,ack)=>{
        const{battleId,username}=data;const b=battles[battleId];
        if(!b||b.status!=='waiting'||b.creator!==username)return ack({ok:false,msg:'Not allowed'});
        if(b.players.length>=b.maxPlayers)return ack({ok:false,msg:'Full'});
        b.players.push(pickBot(new Set(b.players)));
        ack({ok:true});
        io.to(battleId).emit('battle:state',battleSummary(b));
        io.emit('lobby:update',lobbyList());
        if(b.players.length>=b.maxPlayers){startBattle(b);io.to(battleId).emit('battle:state',battleSummary(b));io.emit('lobby:update',lobbyList());}
    });

    socket.on('battle:fillBots',(data,ack)=>{
        const{battleId,username}=data;const b=battles[battleId];
        if(!b||b.status!=='waiting'||b.creator!==username)return ack({ok:false,msg:'Not allowed'});
        const used=new Set(b.players);
        while(b.players.length<b.maxPlayers)b.players.push(pickBot(used));
        ack({ok:true});
        io.to(battleId).emit('battle:state',battleSummary(b));
        io.emit('lobby:update',lobbyList());
        if(b.players.length>=b.maxPlayers){startBattle(b);io.to(battleId).emit('battle:state',battleSummary(b));io.emit('lobby:update',lobbyList());}
    });

    socket.on('battle:join',(data,ack)=>{
        const{battleId,username}=data;const b=battles[battleId];
        if(!b)return ack({ok:false,msg:'Not found'});
        if(b.status!=='waiting')return ack({ok:false,msg:'Already started'});
        if(b.players.includes(username))return ack({ok:false,msg:'Already in'});
        if(b.players.length>=b.maxPlayers)return ack({ok:false,msg:'Full'});
        b.players.push(username);
        socket.join(battleId);
        ack({ok:true,totalCost:b.totalCost,battle:battleSummary(b)});
        io.to(battleId).emit('battle:state',battleSummary(b));
        io.emit('lobby:update',lobbyList());
        if(b.players.length>=b.maxPlayers){startBattle(b);io.to(battleId).emit('battle:state',battleSummary(b));io.emit('lobby:update',lobbyList());}
    });

    socket.on('battle:start',(data,ack)=>{
        const{battleId,username}=data;const b=battles[battleId];
        if(!b||b.status!=='waiting'||b.creator!==username)return ack({ok:false,msg:'Not allowed'});
        if(b.players.length<2)return ack({ok:false,msg:'Need 2+ players'});
        const used=new Set(b.players);
        while(b.players.length<b.maxPlayers)b.players.push(pickBot(used));
        startBattle(b);ack({ok:true});
        io.to(battleId).emit('battle:state',battleSummary(b));
        io.emit('lobby:update',lobbyList());
    });

    socket.on('battle:watch',(data)=>{const{battleId}=data;if(battles[battleId]){socket.join(battleId);socket.emit('battle:state',battleSummary(battles[battleId]));}});

    socket.on('battle:leave',(data,ack)=>{
        const{battleId,username}=data;const b=battles[battleId];
        if(!b)return ack({ok:false});
        socket.leave(battleId);
        if(b.status==='waiting'&&b.players.includes(username)){
            if(b.creator===username){
                const refundPlayers=b.players.filter(p=>!p.startsWith('Bot_'));
                delete battles[battleId];
                ack({ok:true,refund:b.totalCost,disbanded:true,refundPlayers});
                io.to(battleId).emit('battle:disbanded',{battleId});
            }else{
                b.players=b.players.filter(p=>p!==username);
                ack({ok:true,refund:b.totalCost});
                io.to(battleId).emit('battle:state',battleSummary(b));
            }
            io.emit('lobby:update',lobbyList());
        }else{ack({ok:true,refund:0});}
    });

    socket.on('battle:finished',(data)=>{const b=battles[data.battleId];if(b)b.status='finished';});

    // --- COINFLIP ---
    socket.on('coinflip:create',(data,ack)=>{
        const{username,amount,side}=data;
        if(!username||!amount||!['heads','tails'].includes(side))return ack({ok:false,msg:'Invalid'});
        if(amount<=0||amount>1000000)return ack({ok:false,msg:'Bad amount'});
        const id=genId('cf_');
        coinflips[id]={id,creator:username,amount:parseFloat(amount),side,joiner:null,joinerSide:null,
            result:null,winner:null,status:'waiting',createdAt:Date.now()};
        socket.join(id);ack({ok:true,coinflipId:id});
        io.emit('coinflip:lobby',cfLobby());
    });

    socket.on('coinflip:join',(data,ack)=>{
        const{coinflipId,username}=data;const cf=coinflips[coinflipId];
        if(!cf||cf.status!=='waiting')return ack({ok:false,msg:'Not available'});
        if(cf.creator===username)return ack({ok:false,msg:'Cannot join your own'});
        cf.joiner=username;cf.joinerSide=cf.side==='heads'?'tails':'heads';
        cf.result=serverRand()<0.5?'heads':'tails';
        cf.winner=cf.result===cf.side?cf.creator:cf.joiner;
        cf.status='flipping';
        socket.join(coinflipId);ack({ok:true,amount:cf.amount});
        io.to(coinflipId).emit('coinflip:state',cf);
        io.emit('coinflip:lobby',cfLobby());
        setTimeout(()=>{cf.status='finished';io.to(coinflipId).emit('coinflip:state',cf);io.emit('coinflip:lobby',cfLobby());},3500);
    });

    socket.on('coinflip:callBot',(data,ack)=>{
        const{coinflipId,username}=data;const cf=coinflips[coinflipId];
        if(!cf||cf.status!=='waiting'||cf.creator!==username)return ack({ok:false,msg:'Not allowed'});
        const botName=pickBot(new Set([cf.creator]));
        cf.joiner=botName;cf.joinerSide=cf.side==='heads'?'tails':'heads';
        cf.result=serverRand()<0.5?'heads':'tails';
        cf.winner=cf.result===cf.side?cf.creator:cf.joiner;
        cf.status='flipping';
        ack({ok:true});
        io.to(coinflipId).emit('coinflip:state',cf);
        io.emit('coinflip:lobby',cfLobby());
        setTimeout(()=>{cf.status='finished';io.to(coinflipId).emit('coinflip:state',cf);io.emit('coinflip:lobby',cfLobby());},3500);
    });

    socket.on('coinflip:watch',(data)=>{
        const{coinflipId}=data;
        if(coinflips[coinflipId]){socket.join(coinflipId);socket.emit('coinflip:state',coinflips[coinflipId]);}
    });

    socket.on('coinflip:cancel',(data,ack)=>{
        const{coinflipId,username}=data;const cf=coinflips[coinflipId];
        if(!cf||cf.status!=='waiting'||cf.creator!==username)return ack({ok:false});
        delete coinflips[coinflipId];ack({ok:true,refund:cf.amount});
        io.emit('coinflip:lobby',cfLobby());
    });

    socket.on('lobby:refresh',()=>{socket.emit('lobby:update',lobbyList());socket.emit('coinflip:lobby',cfLobby());});
    socket.on('disconnect',()=>{});
});

server.listen(PORT,'0.0.0.0',()=>{
    console.log(`\n  RoUnbox server running at:`);
    console.log(`  Local:   http://localhost:${PORT}/gemini-code-1781564142347.html`);
    const nets=require('os').networkInterfaces();
    for(const name of Object.keys(nets))for(const net of nets[name])if(net.family==='IPv4'&&!net.internal)console.log(`  Network: http://${net.address}:${PORT}/gemini-code-1781564142347.html`);
    console.log(`\n  Share the Network URL with friends!\n`);
});
