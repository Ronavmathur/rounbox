const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname)));
const PORT = 3000;

// ========== USER / AUTH SYSTEM ==========
const AUTH_SALT = 'rounbox_s3cur3_2024';
const users = {};      // { username: { passwordHash, balance, inventory, isAdmin, banned, avatar } }
const sessions = {};   // { token: username }

function hashPwd(pwd) {
    return crypto.createHash('sha256').update(pwd + AUTH_SALT).digest('hex');
}
function genToken() {
    return crypto.randomBytes(24).toString('hex');
}
function hasAnyAdmin() {
    return Object.values(users).some(u => u.isAdmin);
}
function publicUser(username) {
    const u = users[username];
    if (!u) return null;
    return {
        username,
        balance: u.balance,
        inventory: u.inventory,
        isAdmin: !!u.isAdmin,
        avatar: u.avatar || null
    };
}

// extracts "Authorization: Bearer <token>" -> req.user (username) and req.userData
function authMiddleware(req, res, next) {
    const auth = req.headers['authorization'] || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    const username = token ? sessions[token] : null;
    if (!username || !users[username]) {
        return res.status(401).json({ ok: false, msg: 'Not authenticated' });
    }
    if (users[username].banned) {
        delete sessions[token];
        return res.status(403).json({ ok: false, msg: 'Account banned' });
    }
    req.token = token;
    req.user = username;
    req.userData = users[username];
    next();
}
function adminMiddleware(req, res, next) {
    if (!req.userData || !req.userData.isAdmin) {
        return res.status(403).json({ ok: false, msg: 'Admin only' });
    }
    next();
}

// ---- AUTH ENDPOINTS ----
app.get('/api/has-admin', (req, res) => {
    res.json({ ok: true, hasAdmin: hasAnyAdmin() });
});

app.post('/api/signup', (req, res) => {
    let { username, password } = req.body || {};
    if (typeof username !== 'string' || typeof password !== 'string') return res.json({ ok: false, msg: 'Invalid data' });
    username = username.trim().toLowerCase();
    if (username.length < 3) return res.json({ ok: false, msg: 'Username must be 3+ characters' });
    if (!/^[a-z0-9_]+$/.test(username)) return res.json({ ok: false, msg: 'Letters, numbers, underscores only' });
    if (['system', 'root'].includes(username)) return res.json({ ok: false, msg: 'Username not available' });
    const firstAccount = Object.keys(users).length === 0;
    if (firstAccount) {
        if (password.length < 6) return res.json({ ok: false, msg: 'Password must be 6+ characters' });
    } else {
        if (password.length < 4) return res.json({ ok: false, msg: 'Password must be 4+ characters' });
    }
    if (users[username]) return res.json({ ok: false, msg: 'Username already taken' });
    users[username] = {
        passwordHash: hashPwd(password),
        balance: firstAccount ? 10000 : 0,
        inventory: [],
        isAdmin: firstAccount,
        banned: false,
        avatar: null
    };
    const token = genToken();
    sessions[token] = username;
    res.json({ ok: true, token, user: publicUser(username) });
});

app.post('/api/login', (req, res) => {
    let { username, password } = req.body || {};
    if (typeof username !== 'string' || typeof password !== 'string') return res.json({ ok: false, msg: 'Invalid data' });
    username = username.trim().toLowerCase();
    const u = users[username];
    if (!u) return res.json({ ok: false, msg: 'Account not found' });
    if (u.banned) return res.json({ ok: false, msg: 'This account has been banned' });
    if (u.passwordHash !== hashPwd(password)) return res.json({ ok: false, msg: 'Wrong password' });
    const token = genToken();
    sessions[token] = username;
    res.json({ ok: true, token, user: publicUser(username) });
});

app.post('/api/logout', authMiddleware, (req, res) => {
    delete sessions[req.token];
    res.json({ ok: true });
});

app.get('/api/me', authMiddleware, (req, res) => {
    res.json({ ok: true, user: publicUser(req.user) });
});

// ---- BALANCE / INVENTORY ENDPOINTS ----
// Adjust balance by a delta (negative to spend). Rejects if it would go below 0.
app.post('/api/balance', authMiddleware, (req, res) => {
    let { amount } = req.body || {};
    amount = Number(amount);
    if (!isFinite(amount)) return res.json({ ok: false, msg: 'Invalid amount' });
    const next = Math.round((req.userData.balance + amount) * 100) / 100;
    if (next < 0) return res.json({ ok: false, msg: 'Insufficient balance' });
    req.userData.balance = next;
    res.json({ ok: true, balance: req.userData.balance });
});

// Add items to inventory. Body: { items: [ {name, price, imgKey, rarity, id?} ] }
app.post('/api/inventory/add', authMiddleware, (req, res) => {
    const items = (req.body && req.body.items) || [];
    if (!Array.isArray(items)) return res.json({ ok: false, msg: 'Invalid items' });
    items.forEach(it => {
        if (it && !it.isToken && typeof it.price === 'number') req.userData.inventory.push(it);
    });
    res.json({ ok: true, inventory: req.userData.inventory, balance: req.userData.balance });
});

// Sell single item by index.
app.post('/api/inventory/sell', authMiddleware, (req, res) => {
    const idx = Number(req.body && req.body.index);
    const inv = req.userData.inventory;
    if (!Number.isInteger(idx) || idx < 0 || idx >= inv.length) return res.json({ ok: false, msg: 'Invalid index' });
    const price = Number(inv[idx].price) || 0;
    inv.splice(idx, 1);
    req.userData.balance = Math.round((req.userData.balance + price) * 100) / 100;
    res.json({ ok: true, balance: req.userData.balance, inventory: inv });
});

// Sell all items.
app.post('/api/inventory/sellall', authMiddleware, (req, res) => {
    const inv = req.userData.inventory;
    const total = inv.reduce((s, it) => s + (Number(it.price) || 0), 0);
    req.userData.inventory = [];
    req.userData.balance = Math.round((req.userData.balance + total) * 100) / 100;
    res.json({ ok: true, balance: req.userData.balance, inventory: req.userData.inventory });
});

// Save avatar (base64 data URL).
app.post('/api/avatar', authMiddleware, (req, res) => {
    const avatar = req.body && req.body.avatar;
    if (typeof avatar !== 'string' || avatar.length > 200000) return res.json({ ok: false, msg: 'Invalid avatar' });
    req.userData.avatar = avatar;
    res.json({ ok: true });
});

// ---- ADMIN ENDPOINTS ----
app.post('/api/admin/users', authMiddleware, adminMiddleware, (req, res) => {
    const list = Object.keys(users).map(name => ({
        username: name,
        balance: users[name].balance || 0,
        items: (users[name].inventory || []).length,
        isAdmin: !!users[name].isAdmin,
        banned: !!users[name].banned
    }));
    res.json({ ok: true, users: list });
});

app.post('/api/admin/give', authMiddleware, adminMiddleware, (req, res) => {
    const { username } = req.body || {};
    let amount = Number(req.body && req.body.amount);
    const u = users[username];
    if (!u) return res.json({ ok: false, msg: 'User not found' });
    if (!isFinite(amount) || amount <= 0 || amount > 1000000) return res.json({ ok: false, msg: 'Invalid amount' });
    u.balance = Math.round(((u.balance || 0) + amount) * 100) / 100;
    res.json({ ok: true, balance: u.balance });
});

app.post('/api/admin/take', authMiddleware, adminMiddleware, (req, res) => {
    const { username } = req.body || {};
    let amount = Number(req.body && req.body.amount);
    const u = users[username];
    if (!u) return res.json({ ok: false, msg: 'User not found' });
    if (!isFinite(amount) || amount <= 0) return res.json({ ok: false, msg: 'Invalid amount' });
    u.balance = Math.max(0, Math.round(((u.balance || 0) - amount) * 100) / 100);
    res.json({ ok: true, balance: u.balance });
});

app.post('/api/admin/ban', authMiddleware, adminMiddleware, (req, res) => {
    const { username } = req.body || {};
    const u = users[username];
    if (!u || u.isAdmin) return res.json({ ok: false, msg: 'Cannot ban this user' });
    u.banned = true;
    // invalidate any active sessions for the banned user
    for (const t in sessions) if (sessions[t] === username) delete sessions[t];
    res.json({ ok: true });
});

app.post('/api/admin/unban', authMiddleware, adminMiddleware, (req, res) => {
    const { username } = req.body || {};
    const u = users[username];
    if (!u) return res.json({ ok: false, msg: 'User not found' });
    u.banned = false;
    res.json({ ok: true });
});

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
    {id:'pennyflip',name:'Penny Flip',price:0.05,c1:'#52525b',c2:'#27272a',displayItems:['penny','dirt'],normal:[['penny',20],['dirt',15],['grass',12],['pizzabox',8],['papers',6],['waterbottle',6],['pencil',5],['lightbulb',4],['plate',3],['duck',3],['GOLD',8]],gold:[['dollar',25],['mousepad',22],['usb',18],['coffee',15],['notebook',12],['shovel',8]]},
    {id:'junkdrawer',name:'Junk Drawer',price:0.25,c1:'#92400e',c2:'#451a03',displayItems:['pizzabox','rope'],normal:[['dirt',10],['grass',8],['pizzabox',8],['waterbottle',7],['pencil',6],['penny',5],['papers',5],['lightbulb',5],['duck',5],['rope',5],['plate',4],['thanksticker',4],['legosticker',3],['GOLD',10]],gold:[['dollar',20],['coffee',18],['notebook',15],['mousepad',14],['usb',13],['shovel',10],['dice',5],['mouse',5]]},
    {id:'dirtcheap',name:'Dirt Cheap',price:0.50,c1:'#6b7280',c2:'#374151',displayItems:['dirt','1-dollar-bill'],normal:[['dirt',12],['dollar',12],['penny',8],['grass',6],['mousepad',7],['waterbottle',5],['pencil',5],['duck',5],['usb',5],['lightbulb',4],['plate',4],['notebook',4],['rope',3],['GOLD',10]],gold:[['dice',20],['mouse',18],['ecigar',14],['shovel',12],['vintlamp',12],['poseidon',10],['basketball',8],['chess',6]]},
    {id:'stickerpack',name:'Sticker Pack',price:1.00,c1:'#14b8a6',c2:'#134e4a',displayItems:['legosticker','bmwsticker'],normal:[['legosticker',14],['bmwsticker',12],['thanksticker',10],['penny',6],['pencil',5],['duck',6],['lightbulb',5],['dirt',4],['papers',3],['waterbottle',3],['plate',3],['GOLD',12]],gold:[['dice',18],['poseidon',16],['xylophone',14],['ecigar',12],['mouse',12],['chess',10],['basketball',10],['greyhoodie',8]]},
    {id:'pocket',name:'Pocket Change',price:1.50,c1:'#22c55e',c2:'#14532d',displayItems:['1-dollar-bill','mousepad'],normal:[['dollar',12],['dirt',6],['mousepad',8],['usb',7],['penny',5],['coffee',6],['notebook',6],['duck',5],['pencil',4],['rope',4],['shovel',4],['mouse',4],['GOLD',12]],gold:[['controller',18],['basketball',16],['greyhoodie',14],['chess',12],['ecigar',10],['vintlamp',10],['keyboard',8],['airpods',6],['lolhoodie',6]]},
    {id:'dollarstore',name:'Dollar Store',price:3.00,c1:'#eab308',c2:'#713f12',displayItems:['duck','coffee'],normal:[['dollar',10],['mousepad',8],['usb',7],['coffee',7],['notebook',6],['duck',5],['shovel',5],['rope',4],['plate',4],['vintlamp',4],['mouse',3],['dice',3],['GOLD',12]],gold:[['mouse',18],['basketball',16],['greyhoodie',14],['chess',12],['poseidon',10],['ecigar',8],['keyboard',8],['lolhoodie',7],['controller',7]]},
    {id:'officeraid',name:'Office Raid',price:5.00,c1:'#64748b',c2:'#1e293b',displayItems:['pencil','notebook'],normal:[['pencil',10],['notebook',9],['papers',7],['coffee',7],['mousepad',6],['usb',6],['chair',5],['vintlamp',5],['mouse',4],['dollar',4],['duck',3],['dice',3],['GOLD',12]],gold:[['mouse',18],['chess',16],['greyhoodie',14],['keyboard',12],['basketball',10],['controller',10],['lolhoodie',8],['airpods',6],['ecigar',6]]},
    {id:'hobbybox',name:'Hobby Box',price:8.00,c1:'#f97316',c2:'#7c2d12',displayItems:['dice','xylophone'],normal:[['dice',10],['xylophone',9],['poseidon',8],['duck',5],['legosticker',5],['coffee',5],['vintlamp',5],['ecigar',4],['mouse',4],['bmwsticker',3],['notebook',3],['GOLD',14]],gold:[['basketball',16],['chess',14],['greyhoodie',12],['keyboard',12],['lolhoodie',10],['controller',10],['airpods',8],['mouse',6],['iphone12',4]]},
    {id:'tech',name:'Tech Starter',price:15.00,c1:'#3b82f6',c2:'#1e3a8a',displayItems:['mouse','mousepad'],normal:[['mousepad',10],['usb',8],['mouse',7],['coffee',5],['notebook',5],['vintlamp',5],['keyboard',5],['ecigar',4],['duck',3],['dice',3],['lightbulb',3],['GOLD',14]],gold:[['controller',18],['basketball',14],['greyhoodie',14],['chess',12],['airpods',12],['lolhoodie',10],['poseidon',6],['iphone12',6],['nswitch',4]]},
    {id:'streetwear',name:'Streetwear Drop',price:20.00,c1:'#ec4899',c2:'#831843',displayItems:['greyhoodie','lolhoodie'],normal:[['bmwsticker',8],['legosticker',6],['ecigar',5],['dice',5],['vintlamp',5],['duck',4],['coffee',4],['mouse',4],['greyhoodie',3],['lolhoodie',3],['keyboard',3],['GOLD',14]],gold:[['greyhoodie',18],['lolhoodie',16],['basketball',12],['chess',12],['controller',10],['keyboard',10],['airpods',8],['poseidon',6],['iphone12',4]]},
    {id:'desk',name:'Desk Setup',price:30.00,c1:'#0ea5e9',c2:'#0c4a6e',displayItems:['mouse','keyboard'],normal:[['usb',8],['mousepad',7],['mouse',7],['chair',5],['coffee',5],['keyboard',5],['vintlamp',4],['notebook',4],['dice',3],['ecigar',3],['greyhoodie',3],['GOLD',14]],gold:[['greyhoodie',16],['lolhoodie',14],['controller',12],['airpods',12],['basketball',10],['chess',10],['iphone12',8],['camera',6],['nswitch',6]]},
    {id:'gamer',name:'Gamer Elite',price:75.00,c1:'#10b981',c2:'#064e3b',displayItems:['controller','switch'],normal:[['mouse',8],['keyboard',6],['controller',6],['dice',5],['ecigar',5],['basketball',5],['greyhoodie',5],['vintlamp',4],['lolhoodie',4],['chess',4],['airpods',3],['GOLD',16]],gold:[['airpods',16],['lolhoodie',14],['iphone12',12],['nswitch',12],['camera',10],['ps5',8],['bill500',6],['chess',6],['controller',6]]},
    {id:'creator',name:'Content Creator',price:100.00,c1:'#f43f5e',c2:'#881337',displayItems:['camera','iphone15'],normal:[['mouse',7],['keyboard',6],['ecigar',5],['dice',5],['greyhoodie',5],['basketball',4],['vintlamp',4],['lolhoodie',4],['controller',4],['airpods',3],['camera',3],['GOLD',16]],gold:[['camera',18],['airpods',14],['iphone12',12],['nswitch',12],['iphone15',10],['bill500',8],['ps5',6],['highpowerpc',4]]},
    {id:'console',name:'Console Vault',price:150.00,c1:'#a855f7',c2:'#4c1d95',displayItems:['ps5','switch'],normal:[['keyboard',8],['mouse',6],['controller',7],['basketball',5],['greyhoodie',5],['lolhoodie',5],['airpods',4],['chess',4],['vintlamp',3],['ecigar',3],['camera',3],['GOLD',16]],gold:[['nswitch',18],['iphone12',14],['ps5',14],['bill500',12],['camera',10],['iphone15',8],['rtx',6],['highpowerpc',4]]},
    {id:'luxury',name:'Flex Pack',price:250.00,c1:'#f59e0b',c2:'#78350f',displayItems:['rolex','ps5'],normal:[['controller',7],['basketball',6],['greyhoodie',6],['chess',5],['keyboard',5],['lolhoodie',5],['airpods',5],['mouse',4],['nswitch',3],['iphone12',3],['camera',3],['GOLD',16]],gold:[['ps5',16],['bill500',14],['nswitch',12],['camera',12],['iphone15',10],['rtx',8],['highpowerpc',6],['rolex',4]]},
    {id:'royale',name:'Jackpot Royale',price:500.00,c1:'#ef4444',c2:'#7f1d1d',displayItems:['rolex','rtx'],normal:[['controller',6],['airpods',6],['keyboard',5],['basketball',5],['chess',5],['lolhoodie',5],['greyhoodie',4],['nswitch',4],['iphone12',4],['camera',3],['ps5',3],['GOLD',18]],gold:[['ps5',16],['bill500',14],['camera',12],['iphone15',12],['rtx',10],['highpowerpc',8],['gt86',6],['rolex',4]]},
    {id:'whale',name:"Whale's Paradise",price:1000.00,c1:'#ca8a04',c2:'#713f12',displayItems:['rtx','gt86'],normal:[['nswitch',7],['controller',6],['airpods',6],['keyboard',5],['iphone12',5],['lolhoodie',4],['chess',4],['basketball',4],['camera',4],['ps5',3],['iphone15',3],['GOLD',18]],gold:[['ps5',14],['bill500',12],['iphone15',12],['rtx',12],['highpowerpc',10],['gt86',8],['rolex',6],['bmwx5',2]]},
    {id:'diamond',name:'Diamond Reserve',price:2500.00,c1:'#60a5fa',c2:'#1e3a5f',displayItems:['highpowerpc','bmwx5'],normal:[['nswitch',6],['iphone12',6],['controller',5],['airpods',5],['ps5',5],['camera',5],['keyboard',4],['iphone15',4],['bill500',4],['lolhoodie',3],['chess',3],['rtx',3],['GOLD',18]],gold:[['iphone15',16],['rtx',16],['highpowerpc',14],['gt86',10],['rolex',8],['bmwx5',6]]},
    {id:'thevault',name:'The Vault',price:5000.00,c1:'#fbbf24',c2:'#1a1a2e',displayItems:['bmwx5','rolex'],normal:[['ps5',7],['nswitch',6],['iphone12',5],['camera',5],['airpods',5],['iphone15',5],['keyboard',4],['bill500',4],['rtx',3],['highpowerpc',3],['lolhoodie',3],['controller',3],['GOLD',20]],gold:[['rtx',16],['highpowerpc',16],['gt86',14],['rolex',12],['bmwx5',8]]}
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
    console.log(`  Local:   http://localhost:${PORT}`);
    const nets=require('os').networkInterfaces();
    for(const name of Object.keys(nets))for(const net of nets[name])if(net.family==='IPv4'&&!net.internal)console.log(`  Network: http://${net.address}:${PORT}`);
    console.log(`\n  Share the Network URL with friends!\n`);
});
