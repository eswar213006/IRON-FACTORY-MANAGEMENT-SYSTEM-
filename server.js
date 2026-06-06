const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = 3000;
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const INVENTORY_FILE = path.join(DATA_DIR, 'inventory.json');
const SALES_FILE = path.join(DATA_DIR, 'sales.json');

// Ensure data directory and files exist
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR);
}
if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, JSON.stringify([]));
}
if (!fs.existsSync(INVENTORY_FILE)) {
    fs.writeFileSync(INVENTORY_FILE, JSON.stringify([]));
}
if (!fs.existsSync(SALES_FILE)) {
    fs.writeFileSync(SALES_FILE, JSON.stringify([]));
}

// In-memory sessions map: token -> { username, role, name }
const sessions = new Map();

// Helper: Hashing passwords securely using crypto
function hashPassword(password, salt) {
    return crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
}

function generateSalt() {
    return crypto.randomBytes(16).toString('hex');
}

// Helper: Read JSON file data
function readJSONFile(filePath) {
    try {
        const data = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        console.error(`Error reading ${filePath}:`, err);
        return [];
    }
}

// Helper: Write JSON file data
function writeJSONFile(filePath, data) {
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 4), 'utf8');
        return true;
    } catch (err) {
        console.error(`Error writing ${filePath}:`, err);
        return false;
    }
}

// Helper: Parse request body (JSON)
function parseRequestBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => {
            try {
                if (body) {
                    resolve(JSON.parse(body));
                } else {
                    resolve({});
                }
            } catch (err) {
                reject(err);
            }
        });
    });
}

// Helper: Verify session and get user info from headers
function getAuthenticatedUser(req) {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
    }
    const token = authHeader.substring(7).trim();
    return sessions.get(token) || null;
}

// MIME Types for Static file server
const MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.json': 'application/json'
};

const server = http.createServer(async (req, res) => {
    const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
    const pathname = parsedUrl.pathname;

    console.log(`${req.method} ${pathname}`);

    // CORS Headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // --- API ROUTES ---

    // 1. POST /api/auth/register
    if (pathname === '/api/auth/register' && req.method === 'POST') {
        try {
            const body = await parseRequestBody(req);
            const { name, email, username, password, role, adminKey } = body;

            if (!name || !email || !username || !password || !role) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Missing required fields' }));
                return;
            }

            // Verify Admin security key if role is Admin
            if (role === 'Admin') {
                if (adminKey !== 'FORGE2026') {
                    res.writeHead(403, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Invalid Admin Registration Key' }));
                    return;
                }
            }

            const users = readJSONFile(USERS_FILE);
            
            // Check if username already exists
            if (users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
                res.writeHead(409, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Username is already taken' }));
                return;
            }

            // Check if email already exists
            if (users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
                res.writeHead(409, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Email is already registered' }));
                return;
            }

            // Create user
            const salt = generateSalt();
            const passwordHash = hashPassword(password, salt);

            const newUser = {
                id: crypto.randomUUID(),
                name,
                email,
                username,
                passwordHash,
                salt,
                role
            };

            users.push(newUser);
            writeJSONFile(USERS_FILE, users);

            // Clean output (don't send hash/salt back)
            const { passwordHash: _, salt: __, ...userResponse } = newUser;

            res.writeHead(201, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ message: 'User registered successfully', user: userResponse }));
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to process registration' }));
        }
        return;
    }

    // 2. POST /api/auth/login
    if (pathname === '/api/auth/login' && req.method === 'POST') {
        try {
            const body = await parseRequestBody(req);
            const { username, password } = body;

            if (!username || !password) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Username and password are required' }));
                return;
            }

            const users = readJSONFile(USERS_FILE);
            const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());

            if (!user) {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid username or password' }));
                return;
            }

            // Verify password
            const calculatedHash = hashPassword(password, user.salt);
            if (calculatedHash !== user.passwordHash) {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid username or password' }));
                return;
            }

            // Create Session
            const token = crypto.randomUUID();
            const sessionData = { username: user.username, role: user.role, name: user.name };
            sessions.set(token, sessionData);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                message: 'Login successful',
                token,
                user: sessionData
            }));
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to process login' }));
        }
        return;
    }

    // ALL SECURED API ROUTES BEYOND THIS POINT REQUIRE AUTHENTICATION
    const user = getAuthenticatedUser(req);
    if (pathname.startsWith('/api/') && pathname !== '/api/auth/login' && pathname !== '/api/auth/register') {
        if (!user) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Unauthorized. Please login again.' }));
            return;
        }
    }

    // 3. GET /api/inventory
    if (pathname === '/api/inventory' && req.method === 'GET') {
        const inventory = readJSONFile(INVENTORY_FILE);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(inventory));
        return;
    }

    // 4. POST /api/inventory (Admin only)
    if (pathname === '/api/inventory' && req.method === 'POST') {
        if (user.role !== 'Admin') {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Forbidden. Admin privileges required.' }));
            return;
        }

        try {
            const body = await parseRequestBody(req);
            const { sku, name, quantity, size, sell, category, location, minStock } = body;

            if (!sku || !name || isNaN(quantity) || !size || isNaN(sell) || !category || !location || isNaN(minStock)) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid material SKU payload' }));
                return;
            }

            const inventory = readJSONFile(INVENTORY_FILE);
            if (inventory.some(item => item.sku.toLowerCase() === sku.toLowerCase())) {
                res.writeHead(409, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: `SKU ${sku} already exists` }));
                return;
            }

            const newItem = { sku, name, quantity, size, sell, category, location, minStock };
            inventory.push(newItem);
            writeJSONFile(INVENTORY_FILE, inventory);

            res.writeHead(201, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(newItem));
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to save material SKU' }));
        }
        return;
    }

    // 5. PUT /api/inventory (Admin only)
    if (pathname === '/api/inventory' && req.method === 'PUT') {
        if (user.role !== 'Admin') {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Forbidden. Admin privileges required.' }));
            return;
        }

        const skuParam = parsedUrl.searchParams.get('sku');
        if (!skuParam) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'SKU parameter is required' }));
            return;
        }

        try {
            const body = await parseRequestBody(req);
            const inventory = readJSONFile(INVENTORY_FILE);
            const index = inventory.findIndex(item => item.sku.toLowerCase() === skuParam.toLowerCase());

            if (index === -1) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: `Material SKU ${skuParam} not found` }));
                return;
            }

            // Update item details (keep original quantity, it's only modified via operations)
            inventory[index] = {
                ...inventory[index],
                name: body.name || inventory[index].name,
                category: body.category || inventory[index].category,
                minStock: isNaN(body.minStock) ? inventory[index].minStock : parseInt(body.minStock),
                location: body.location || inventory[index].location,
                size: body.size || inventory[index].size,
                sell: isNaN(body.sell) ? inventory[index].sell : parseFloat(body.sell)
            };

            writeJSONFile(INVENTORY_FILE, inventory);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(inventory[index]));
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to update material SKU' }));
        }
        return;
    }

    // 6. DELETE /api/inventory (Admin only)
    if (pathname === '/api/inventory' && req.method === 'DELETE') {
        if (user.role !== 'Admin') {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Forbidden. Admin privileges required.' }));
            return;
        }

        const skuParam = parsedUrl.searchParams.get('sku');
        if (!skuParam) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'SKU parameter is required' }));
            return;
        }

        const inventory = readJSONFile(INVENTORY_FILE);
        const filtered = inventory.filter(item => item.sku.toLowerCase() !== skuParam.toLowerCase());

        if (inventory.length === filtered.length) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: `Material SKU ${skuParam} not found` }));
            return;
        }

        writeJSONFile(INVENTORY_FILE, filtered);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: `Material SKU ${skuParam} deleted successfully` }));
        return;
    }

    // 7. POST /api/operations/dispatch
    if (pathname === '/api/operations/dispatch' && req.method === 'POST') {
        try {
            const body = await parseRequestBody(req);
            const { sku, quantity, destination } = body;

            if (!sku || isNaN(quantity) || quantity <= 0 || !destination) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Missing required dispatch parameters' }));
                return;
            }

            const inventory = readJSONFile(INVENTORY_FILE);
            const index = inventory.findIndex(item => item.sku.toLowerCase() === sku.toLowerCase());

            if (index === -1) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: `Material SKU ${sku} not found` }));
                return;
            }

            const item = inventory[index];
            if (quantity > item.quantity) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: `Insufficient stock! Yard only has ${item.quantity} units/tons.` }));
                return;
            }

            // Deduct stock
            inventory[index].quantity -= quantity;
            writeJSONFile(INVENTORY_FILE, inventory);

            // Log dispatch shipment
            const sales = readJSONFile(SALES_FILE);
            const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
            const totalInvoice = quantity * item.sell;
            const newSale = {
                timestamp,
                sku: item.sku,
                name: item.name,
                category: item.category,
                size: item.size || '',
                quantity,
                price: item.sell,
                total: totalInvoice,
                destination
            };

            sales.unshift(newSale); // Newest first
            writeJSONFile(SALES_FILE, sales);

            res.writeHead(201, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ message: 'Dispatch recorded successfully', sale: newSale }));
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to record dispatch' }));
        }
        return;
    }

    // 8. POST /api/operations/restock
    if (pathname === '/api/operations/restock' && req.method === 'POST') {
        try {
            const body = await parseRequestBody(req);
            const { sku, quantity, supplier } = body;

            if (!sku || isNaN(quantity) || quantity <= 0 || !supplier) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Missing required intake parameters' }));
                return;
            }

            const inventory = readJSONFile(INVENTORY_FILE);
            const index = inventory.findIndex(item => item.sku.toLowerCase() === sku.toLowerCase());

            if (index === -1) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: `Material SKU ${sku} not found` }));
                return;
            }

            // Add stock
            inventory[index].quantity += quantity;
            writeJSONFile(INVENTORY_FILE, inventory);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ message: 'Intake recorded successfully', item: inventory[index] }));
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to record intake' }));
        }
        return;
    }

    // 9. GET /api/sales
    if (pathname === '/api/sales' && req.method === 'GET') {
        const sales = readJSONFile(SALES_FILE);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(sales));
        return;
    }

    // 10. POST /api/reset (Admin only)
    if (pathname === '/api/reset' && req.method === 'POST') {
        if (user.role !== 'Admin') {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Forbidden. Admin privileges required.' }));
            return;
        }

        try {
            // Reset inventory and sales log to empty arrays
            writeJSONFile(INVENTORY_FILE, []);
            writeJSONFile(SALES_FILE, []);

            // Set counter back to 1
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ message: 'Foundry database has been cleared completely' }));
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to reset database' }));
        }
        return;
    }

    // --- STATIC FILES SERVER ---
    let filePath = pathname === '/' ? './index.html' : '.' + pathname;
    filePath = path.normalize(filePath);
    
    // Resolve absolute path
    const resolvedPath = path.resolve(filePath);
    const rootPath = path.resolve('.');
    
    // Security check: ensure path is within root
    if (!resolvedPath.startsWith(rootPath)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Forbidden');
        return;
    }
    
    fs.stat(resolvedPath, (err, stats) => {
        if (err || !stats.isFile()) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('File Not Found');
            return;
        }
        
        const ext = path.extname(resolvedPath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        
        res.writeHead(200, { 'Content-Type': contentType });
        const stream = fs.createReadStream(resolvedPath);
        stream.pipe(res);
    });
});

server.listen(PORT, () => {
    console.log(`==========================================================`);
    console.log(`FerrumForge Industrial server running at http://localhost:${PORT}/`);
    console.log(`Press Ctrl+C to terminate the server`);
    console.log(`==========================================================`);
});
