/* TableTalk AI - Customer Frontend JavaScript */

const API_BASE = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000' 
    : `${window.location.protocol}//${window.location.host}`;

const AppState = {
    user: { name: 'Guest', accessCode: null, tableNumber: null, isAuthenticated: false },
    cart: [],
    conversation: { step: 1, messages: [], isListening: false },
    menu: {
        burgers: [
            { id: 1, name: 'Hot Burger', price: 10.50, description: 'Grilled burger with chicken, lettuce, tomato and special sauce' },
            { id: 2, name: 'Crunch Burger', price: 8.50, description: 'Crispy fried patty with special crunchy coating and cheese' },
            { id: 3, name: 'Beef Burger', price: 9.50, description: 'Premium beef patty with sesame bun and fresh vegetables' },
            { id: 4, name: 'Deluxe Burger', price: 12.00, description: 'Premium burger with cheese, bacon, lettuce and special sauce' }
        ],
        shakes: [
            { id: 5, name: 'Classic Shake', price: 4.50, description: 'Creamy vanilla milkshake blend' },
            { id: 6, name: 'Berry Shake', price: 4.50, description: 'Mixed berry and cream shake' },
            { id: 7, name: 'Dash Coffee', price: 2.50, description: 'Espresso with steamed milk' },
            { id: 8, name: 'Coconut Tea', price: 3.50, description: 'Refreshing coconut iced tea' }
        ],
        sides: [
            { id: 9, name: 'Cake Bites', price: 3.50, description: 'Mini cake pastries' },
            { id: 10, name: 'Cheesy Cup', price: 3.50, description: 'Melted cheese dip cup' },
            { id: 11, name: 'Chicken Strips', price: 2.50, description: 'Crispy chicken tenders' },
            { id: 12, name: 'Cheesy Soup', price: 3.50, description: 'Creamy cheese soup' },
            { id: 13, name: 'Crispy Salads', price: 3.50, description: 'Fresh garden salad' },
            { id: 14, name: 'Egg Shakes', price: 5.00, description: 'Protein-rich egg shake' }
        ],
        desserts: [
            { id: 15, name: 'Fruit & Ice', price: 7.95, description: 'Fresh fruits with ice cream' },
            { id: 16, name: 'Mango Sundae', price: 6.95, description: 'Mango ice cream sundae' }
        ]
    }
};

const VALID_ACCESS_CODES = ['TABLE01', 'TABLE02', 'TABLE03', 'TABLE04', 'TABLE05', 'DEMO123']; // Fallback only

// Voice AI State
let voiceWebSocket = null;
let isVoiceConnected = false;
let audioContext = null;
let audioQueue = [];
let isPlaying = false;
let mediaStream = null;
let audioProcessor = null;
let isMicActive = false;

// Storage
const Storage = {
    save(key, data) { try { localStorage.setItem(`tabletalk_${key}`, JSON.stringify(data)); } catch (e) {} },
    load(key) { try { const d = localStorage.getItem(`tabletalk_${key}`); return d ? JSON.parse(d) : null; } catch (e) { return null; } },
    remove(key) { try { localStorage.removeItem(`tabletalk_${key}`); } catch (e) {} },
    clear() { try { Object.keys(localStorage).filter(k => k.startsWith('tabletalk_')).forEach(k => localStorage.removeItem(k)); } catch (e) {} }
};

// Init
document.addEventListener('DOMContentLoaded', () => {
    loadState();
    initPage();
});

function loadState() {
    const savedUser = Storage.load('user');
    if (savedUser) AppState.user = savedUser;
    const savedCart = Storage.load('cart');
    if (savedCart) AppState.cart = savedCart;
    const savedConv = Storage.load('conversation');
    if (savedConv) {
        AppState.conversation.messages = savedConv.messages || [];
        AppState.conversation.step = savedConv.step || 1;
    }
}

function saveState() {
    Storage.save('user', AppState.user);
    Storage.save('cart', AppState.cart);
    Storage.save('conversation', { messages: AppState.conversation.messages, step: AppState.conversation.step });
}

function initPage() {
    const page = document.body.className;
    if (page.includes('entry-page')) initEntryPage();
    else if (page.includes('menu-page')) initMenuPage();
    else if (page.includes('order-page')) initOrderPage();
}

// Entry Page
function initEntryPage() {
    const form = document.getElementById('accessForm');
    const input = document.getElementById('accessCode');
    if (form) form.addEventListener('submit', handleAccessSubmit);
    if (input) input.addEventListener('input', () => { input.value = input.value.toUpperCase(); });
    if (AppState.user.isAuthenticated) window.location.href = 'menu.html';
}

function handleAccessSubmit(e) {
    e.preventDefault();
    const code = document.getElementById('accessCode').value.trim().toUpperCase();
    validateAccessCode(code);
}

async function validateAccessCode(code) {
    const input = document.getElementById('accessCode');
    try {
        const response = await fetch(`${API_BASE}/api/auth/validate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code })
        });
        const data = await response.json();
        if (data.valid) {
            AppState.user = { accessCode: data.code, tableNumber: data.tableNumber, isAuthenticated: true, name: data.tableNumber || 'Guest' };
            saveState();
            showToast('Access granted!', 'success');
            setTimeout(() => { window.location.href = 'menu.html'; }, 800);
        } else {
            showToast('Invalid access code', 'error');
            input.classList.add('error');
            setTimeout(() => input.classList.remove('error'), 2000);
        }
    } catch (error) {
        if (VALID_ACCESS_CODES.includes(code)) {
            AppState.user = { accessCode: code, isAuthenticated: true, name: 'Guest' };
            saveState();
            showToast('Access granted!', 'success');
            setTimeout(() => { window.location.href = 'menu.html'; }, 800);
        } else {
            showToast('Invalid access code', 'error');
        }
    }
}

// Menu Page
function initMenuPage() {
    if (!AppState.user.isAuthenticated) { window.location.href = 'index.html'; return; }
    updateUserUI();
    updateCartUI();
    loadConversationHistory();
    if (AppState.conversation.messages.length === 0) {
        setTimeout(() => {
            addAIMessage(`Hi ${AppState.user.name}! I'm your TableTalk AI assistant. I can help you browse our menu and take your order. What would you like today?`);
            AppState.conversation.step = 1;
            saveState();
        }, 500);
    }
}

function updateUserUI() {
    const welcomeNameEl = document.getElementById('welcomeName');
    const sideNavName = document.getElementById('sideNavName');
    const sideNavTable = document.getElementById('sideNavTable');
    const sideNavAvatar = document.getElementById('sideNavAvatar');
    
    if (welcomeNameEl) welcomeNameEl.textContent = AppState.user.name;
    if (sideNavName) sideNavName.textContent = AppState.user.name;
    if (sideNavTable) sideNavTable.textContent = AppState.user.tableNumber || AppState.user.accessCode || 'Table -';
    if (sideNavAvatar) sideNavAvatar.textContent = AppState.user.name.charAt(0).toUpperCase();
}

// Side Navigation
function toggleSideNav() {
    const sideNav = document.getElementById('sideNav');
    const overlay = document.getElementById('sideNavOverlay');
    const hamburger = document.getElementById('hamburgerBtn');
    if (sideNav) sideNav.classList.toggle('active');
    if (overlay) overlay.classList.toggle('active');
    if (hamburger) hamburger.classList.toggle('active');
}

// Cart Functions
function addToCart(id, name, price) {
    const existingItem = AppState.cart.find(item => item.id === id);
    if (existingItem) existingItem.quantity += 1;
    else AppState.cart.push({ id, name, price, quantity: 1 });
    saveState();
    updateCartUI();
    showToast(`${name} added to tray`, 'success');
    setTimeout(() => addAIMessage(`Great choice! ${name} added to your tray. Would you like anything else?`), 500);
}

function removeFromCart(id) {
    const index = AppState.cart.findIndex(item => item.id === id);
    if (index > -1) {
        if (AppState.cart[index].quantity > 1) AppState.cart[index].quantity -= 1;
        else AppState.cart.splice(index, 1);
        saveState();
        updateCartUI();
    }
}

function increaseQuantity(id) {
    const item = AppState.cart.find(item => item.id === id);
    if (item) { item.quantity += 1; saveState(); updateCartUI(); }
}

function decreaseQuantity(id) { removeFromCart(id); }

function getCartTotal() {
    return AppState.cart.reduce((total, item) => total + (item.price * item.quantity), 0);
}

function updateCartUI() {
    const trayItems = document.getElementById('trayItems');
    const totalPrice = document.getElementById('totalPrice');
    const checkoutBtn = document.getElementById('checkoutBtn');
    if (!trayItems) return;

    if (AppState.cart.length === 0) {
        trayItems.innerHTML = '<p class="empty-tray">Your tray is empty</p>';
        if (totalPrice) totalPrice.textContent = '$0.00';
        if (checkoutBtn) checkoutBtn.disabled = true;
        return;
    }

    trayItems.innerHTML = AppState.cart.map(item => `
        <div class="tray-item" data-id="${item.id}">
            <div class="tray-item-info"><span class="tray-item-name">${item.name}</span></div>
            <div class="tray-item-qty">
                <button class="qty-btn" onclick="decreaseQuantity(${item.id})">-</button>
                <span class="qty-value">${item.quantity}</span>
                <button class="qty-btn" onclick="increaseQuantity(${item.id})">+</button>
            </div>
            <span class="tray-item-price">$${(item.price * item.quantity).toFixed(2)}</span>
        </div>
    `).join('');

    if (totalPrice) totalPrice.textContent = `$${getCartTotal().toFixed(2)}`;
    if (checkoutBtn) checkoutBtn.disabled = false;
}

function goToCheckout() {
    if (AppState.cart.length === 0) { showToast('Your tray is empty!', 'error'); return; }
    AppState.conversation.step = 3;
    saveState();
    window.location.href = 'order.html';
}

// Voice AI Integration (ElevenLabs)
let voiceReconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 3;
let intentionalDisconnect = false;

async function toggleVoiceAI() {
    // Resume audio context on user click (required by browsers)
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioContext.state === 'suspended') {
        await audioContext.resume();
    }
    
    if (isVoiceConnected) {
        intentionalDisconnect = true;
        stopVoiceSession();
        showToast('Voice AI disconnected', 'success');
    } else {
        intentionalDisconnect = false;
        voiceReconnectAttempts = 0;
        await startVoiceSession();
    }
}

async function startVoiceSession() {
    try {
        showToast(voiceReconnectAttempts > 0 ? 'Reconnecting to Rachel...' : 'Connecting to Rachel...', 'success');
        const response = await fetch(`${API_BASE}/api/voice/signed-url`);
        if (!response.ok) throw new Error('Failed to get voice session');
        const { signedUrl } = await response.json();
        
        voiceWebSocket = new WebSocket(signedUrl);
        
        voiceWebSocket.onopen = () => {
            isVoiceConnected = true;
            voiceReconnectAttempts = 0;
            updateVoiceButton(true);
            
            // Send conversation initiation with current cart context
            const cartSummary = AppState.cart.length > 0 
                ? `Customer's current tray: ${AppState.cart.map(i => `${i.quantity}x ${i.name}`).join(', ')}`
                : '';
            
            voiceWebSocket.send(JSON.stringify({
                type: "conversation_initiation_client_data",
                conversation_config_override: {
                    agent: {
                        first_message: voiceReconnectAttempts > 0 
                            ? "I'm back! Sorry about that little hiccup. Where were we?"
                            : "Hey there! Welcome to TableTalk! I'm Rachel, and I'm so happy to help you today. Are you ready to see what's on the menu, or do you already have something in mind?",
                        prompt_suffix: cartSummary
                    }
                }
            }));
            
            showToast('Rachel is ready!', 'success');
        };
        
        voiceWebSocket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            handleVoiceEvent(data);
        };
        
        voiceWebSocket.onclose = () => handleVoiceDisconnect();
        voiceWebSocket.onerror = () => handleVoiceDisconnect();
    } catch (error) {
        showToast('Could not connect: ' + error.message, 'error');
        handleVoiceDisconnect();
    }
}

function handleVoiceDisconnect() {
    const wasConnected = isVoiceConnected;
    cleanupVoiceSession();
    
    // Auto-reconnect if disconnected unexpectedly
    if (!intentionalDisconnect && wasConnected && voiceReconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        voiceReconnectAttempts++;
        showToast(`Connection lost. Reconnecting (${voiceReconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`, 'error');
        setTimeout(() => startVoiceSession(), 2000);
    } else if (voiceReconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        showToast('Could not reconnect. Your cart is saved - tap to try again.', 'error');
        saveState(); // Ensure cart is saved
    }
}

function stopVoiceSession() {
    intentionalDisconnect = true;
    if (voiceWebSocket && voiceWebSocket.readyState === WebSocket.OPEN) voiceWebSocket.close();
    cleanupVoiceSession();
}

function cleanupVoiceSession() {
    voiceWebSocket = null;
    isVoiceConnected = false;
    audioQueue = [];
    isPlaying = false;
    updateVoiceButton(false);
}

function handleVoiceEvent(data) {
    console.log('Voice event:', data.type, data);
    switch (data.type) {
        case 'conversation_initiation_metadata':
            console.log('Conversation started:', data.conversation_initiation_metadata_event?.conversation_id);
            break;
        case 'ping':
            if (voiceWebSocket?.readyState === WebSocket.OPEN) {
                voiceWebSocket.send(JSON.stringify({ type: 'pong', event_id: data.ping_event?.event_id }));
            }
            break;
        case 'user_transcript':
            const userText = data.user_transcription_event?.user_transcript;
            if (userText?.trim()) { 
                addUserMessage(userText); 
                processOrderFromVoice(userText); 
            }
            break;
        case 'agent_response':
            const agentText = data.agent_response_event?.agent_response;
            if (agentText) {
                addAIMessage(agentText);
                // Check if Rachel confirmed order sent to kitchen
                checkForOrderConfirmation(agentText);
            }
            break;
        case 'audio':
            const audioBase64 = data.audio_event?.audio_base_64;
            if (audioBase64) playAudioChunk(audioBase64);
            break;
        case 'interruption':
            audioQueue = [];
            isPlaying = false;
            break;
    }
}

// Check if Rachel confirmed the order - Uses Gemini AI for accurate parsing
async function checkForOrderConfirmation(text) {
    console.log('Rachel said:', text);

    try {
        const allMenuItems = [
            ...AppState.menu.burgers,
            ...AppState.menu.shakes,
            ...AppState.menu.sides,
            ...AppState.menu.desserts
        ];

        const response = await fetch(`${API_BASE}/api/ai/parse-order`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                rachelResponse: text,
                currentCart: AppState.cart,
                menu: allMenuItems
            })
        });

        if (!response.ok) {
            throw new Error('API request failed');
        }

        const cartUpdate = await response.json();
        console.log('Gemini cart update:', cartUpdate);

        if (cartUpdate.error) {
            throw new Error(cartUpdate.error);
        }

        if (cartUpdate.action === 'add') {
            cartUpdate.items.forEach(item => {
                const existing = AppState.cart.find(c => c.id === item.id);
                if (existing) {
                    existing.quantity += item.quantity;
                } else {
                    AppState.cart.push({
                        id: item.id,
                        name: item.name,
                        price: item.price,
                        quantity: item.quantity
                    });
                }
            });
            saveState();
            updateCartUI();
            console.log('Added via Gemini:', cartUpdate.items.map(i => `${i.quantity}x ${i.name}`));

        } else if (cartUpdate.action === 'remove') {
            cartUpdate.items.forEach(item => {
                const existing = AppState.cart.find(c => c.id === item.id);
                if (existing) {
                    existing.quantity -= item.quantity;
                    if (existing.quantity <= 0) {
                        AppState.cart = AppState.cart.filter(c => c.id !== item.id);
                    }
                }
            });
            saveState();
            updateCartUI();
            console.log('Removed via Gemini:', cartUpdate.items.map(i => `${i.quantity}x ${i.name}`));

        } else if (cartUpdate.action === 'confirm') {
            // Replace cart with confirmed items (most accurate)
            AppState.cart = cartUpdate.items;
            saveState();
            updateCartUI();
            setTimeout(() => showToast('Order confirmed! Checkout when ready.', 'success'), 500);
            console.log('Order confirmed via Gemini:', cartUpdate.items.map(i => `${i.quantity}x ${i.name}`));

        } else if (cartUpdate.action === 'clear') {
            AppState.cart = [];
            saveState();
            updateCartUI();
        }
        // action === 'none' means no cart changes needed

    } catch (error) {
        console.error('Gemini AI parsing error, falling back to text parsing:', error);
        // Fallback to legacy text parsing if API fails
        checkForOrderConfirmationFallback(text);
    }
}

// Legacy fallback: Check if Rachel confirmed the order using text parsing
function checkForOrderConfirmationFallback(text) {
    const lowerText = text.toLowerCase();

    // Final confirmation - sync tray to this message
    if (lowerText.includes("i've added everything to your tray")) {
        syncTrayToMessage(text);
        setTimeout(() => showToast('Order confirmed! Checkout when ready.', 'success'), 500);
        return;
    }

    // Check for "added" - add items with quantity
    if (lowerText.includes('added')) {
        const items = extractItemsWithQuantity(text);
        items.forEach(({ item, qty }) => {
            const existing = AppState.cart.find(c => c.id === item.id);
            if (existing) {
                existing.quantity += qty;
            } else {
                AppState.cart.push({ id: item.id, name: item.name, price: item.price, quantity: qty });
            }
        });
        if (items.length > 0) {
            saveState();
            updateCartUI();
            console.log('Added (fallback):', items.map(i => `${i.qty}x ${i.item.name}`));
        }
    }

    // Check for "removed" - remove items
    if (lowerText.includes('removed')) {
        const items = extractItemsWithQuantity(text);
        items.forEach(({ item, qty }) => {
            const cartItem = AppState.cart.find(c => c.id === item.id);
            if (cartItem) {
                cartItem.quantity -= qty;
                if (cartItem.quantity <= 0) {
                    AppState.cart = AppState.cart.filter(c => c.id !== item.id);
                }
            }
        });
        if (items.length > 0) {
            saveState();
            updateCartUI();
            console.log('Removed (fallback):', items.map(i => `${i.qty}x ${i.item.name}`));
        }
    }
}

// Extract menu items with quantities from text
function extractItemsWithQuantity(text) {
    const allItems = [...AppState.menu.burgers, ...AppState.menu.shakes, ...AppState.menu.sides, ...AppState.menu.desserts];
    const found = [];
    const numWords = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
    
    for (const item of allItems) {
        const itemName = item.name.toLowerCase();
        const regex = new RegExp(`(\\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten)?\\s*${itemName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}s?`, 'gi');
        const match = text.match(regex);
        if (match) {
            // Extract quantity from the match
            const qtyMatch = match[0].match(/^(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten)\s/i);
            let qty = 1;
            if (qtyMatch) {
                const qtyStr = qtyMatch[1].toLowerCase();
                qty = numWords[qtyStr] || parseInt(qtyStr) || 1;
            }
            found.push({ item, qty });
        }
    }
    return found;
}

// Sync tray to match items in message (for final confirmation)
function syncTrayToMessage(text) {
    const allItems = [...AppState.menu.burgers, ...AppState.menu.shakes, ...AppState.menu.sides, ...AppState.menu.desserts];
    const numWords = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
    
    const confirmedItems = [];
    for (const item of allItems) {
        const itemName = item.name.toLowerCase();
        const regex = new RegExp(`(\\d+|one|two|three|four|five|six|seven|eight|nine|ten)?\\s*${itemName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}s?`, 'gi');
        const match = text.match(regex);
        if (match) {
            const qtyMatch = match[0].match(/^(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s/i);
            let quantity = 1;
            if (qtyMatch) {
                const qtyStr = qtyMatch[1].toLowerCase();
                quantity = numWords[qtyStr] || parseInt(qtyStr) || 1;
            }
            confirmedItems.push({ id: item.id, name: item.name, price: item.price, quantity });
        }
    }
    
    if (confirmedItems.length > 0) {
        AppState.cart = confirmedItems;
        saveState();
        updateCartUI();
        console.log('Tray synced:', confirmedItems.map(i => `${i.quantity}x ${i.name}`));
    }
}

async function playAudioChunk(base64Audio) {
    try {
        // Ensure audio context is ready
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioContext.state === 'suspended') {
            console.log('Resuming audio context...');
            await audioContext.resume();
        }
        
        const binaryString = atob(base64Audio);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
        
        // PCM 16-bit to Float32
        const pcmData = new Int16Array(bytes.buffer);
        const floatData = new Float32Array(pcmData.length);
        for (let i = 0; i < pcmData.length; i++) floatData[i] = pcmData[i] / 32768;
        
        const audioBuffer = audioContext.createBuffer(1, floatData.length, 16000);
        audioBuffer.getChannelData(0).set(floatData);
        
        audioQueue.push(audioBuffer);
        console.log('Audio chunk queued, queue length:', audioQueue.length);
        if (!isPlaying) playNextAudio();
    } catch (error) {
        console.error('Audio playback error:', error);
    }
}

function playNextAudio() {
    if (audioQueue.length === 0) { 
        isPlaying = false; 
        console.log('Audio queue empty, playback stopped');
        return; 
    }
    isPlaying = true;
    const buffer = audioQueue.shift();
    console.log('Playing audio chunk, remaining:', audioQueue.length);
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);
    source.onended = () => playNextAudio();
    source.start(0);
}

function updateVoiceButton(connected) {
    const voiceBtn = document.getElementById('voiceConnectBtn');
    if (voiceBtn) {
        voiceBtn.classList.toggle('connected', connected);
        voiceBtn.title = connected ? 'Voice AI Connected - Click to disconnect' : 'Click to connect Voice AI';
    }
}

function processOrderFromVoice(text) {
    const lowerText = text.toLowerCase();
    const allItems = [...AppState.menu.burgers, ...AppState.menu.shakes, ...AppState.menu.sides, ...AppState.menu.desserts];
    
    for (const item of allItems) {
        const itemNameLower = item.name.toLowerCase();
        const words = itemNameLower.split(' ');
        
        // Check various ways the item might be mentioned
        if (lowerText.includes(itemNameLower) || 
            words.every(word => lowerText.includes(word)) ||
            (words.length > 1 && words[0].length > 3 && lowerText.includes(words[0]))) {
            
            // Check for quantity
            let quantity = 1;
            const quantityMatch = lowerText.match(/(\d+)\s*(x\s*)?(hot|crunch|beef|deluxe|classic|berry|dash|coconut|cake|cheesy|chicken|crispy|egg|fruit|mango)/i);
            if (quantityMatch) {
                quantity = parseInt(quantityMatch[1]) || 1;
            }
            
            for (let i = 0; i < quantity; i++) {
                addToCartSilent(item.id, item.name, item.price);
            }
            return true;
        }
    }
    return false;
}

// Add to cart without showing toast (for voice orders)
function addToCartSilent(id, name, price) {
    const existingItem = AppState.cart.find(item => item.id === id);
    if (existingItem) {
        existingItem.quantity += 1;
    } else {
        AppState.cart.push({ id, name, price, quantity: 1, addedAt: Date.now() });
    }
    saveState();
    updateCartUI();
    console.log('Cart updated:', AppState.cart);
}

function sendTextToVoice(text) {
    if (!voiceWebSocket || voiceWebSocket.readyState !== WebSocket.OPEN) {
        showToast('Voice AI not connected. Click the chat icon to connect.', 'error');
        return false;
    }
    // Send user text message - correct format per ElevenLabs docs
    const message = {
        user_audio_chunk: btoa(text) // For text, we can also try sending as audio chunk
    };
    console.log('Sending text to Rachel:', text);
    
    // Try sending as a text message format
    voiceWebSocket.send(JSON.stringify({
        type: "user_message",
        text: text
    }));
    return true;
}

// Mic for speech-to-text (feeds into voice AI when connected)
async function toggleMic() {
    if (isMicActive) {
        stopMic();
    } else {
        await startMic();
    }
}

async function startMic() {
    try {
        if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
        if (audioContext.state === 'suspended') await audioContext.resume();
        
        mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        isMicActive = true;
        updateMicButton(true);
        showToast('Microphone on - speak now!', 'success');
        
        // If voice AI is connected, stream audio to it
        if (isVoiceConnected && voiceWebSocket?.readyState === WebSocket.OPEN) {
            startAudioStreaming();
        } else {
            // Use browser speech recognition as fallback
            startSpeechRecognition();
        }
    } catch (e) {
        showToast('Could not access microphone', 'error');
    }
}

function stopMic() {
    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
        mediaStream = null;
    }
    if (audioProcessor) {
        audioProcessor.disconnect();
        audioProcessor = null;
    }
    if (window.speechRecognition) {
        window.speechRecognition.stop();
    }
    isMicActive = false;
    updateMicButton(false);
}

function startAudioStreaming() {
    if (!mediaStream || !voiceWebSocket) return;
    
    const captureCtx = new AudioContext({ sampleRate: 16000 });
    const source = captureCtx.createMediaStreamSource(mediaStream);
    audioProcessor = captureCtx.createScriptProcessor(4096, 1, 1);
    
    audioProcessor.onaudioprocess = (e) => {
        if (!voiceWebSocket || voiceWebSocket.readyState !== WebSocket.OPEN || !isMicActive) return;
        const inputData = e.inputBuffer.getChannelData(0);
        const pcmData = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
            pcmData[i] = Math.max(-32768, Math.min(32767, inputData[i] * 32768));
        }
        const base64Audio = btoa(String.fromCharCode.apply(null, new Uint8Array(pcmData.buffer)));
        voiceWebSocket.send(JSON.stringify({ user_audio_chunk: base64Audio }));
    };
    
    source.connect(audioProcessor);
    audioProcessor.connect(captureCtx.destination);
}

function startSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        showToast('Speech recognition not supported in this browser', 'error');
        stopMic();
        return;
    }
    
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';
    
    recognition.onresult = (event) => {
        const text = event.results[0][0].transcript;
        document.getElementById('voiceInput').value = text;
        sendVoiceMessage();
    };
    
    recognition.onerror = () => stopMic();
    recognition.onend = () => stopMic();
    
    window.speechRecognition = recognition;
    recognition.start();
}

function updateMicButton(active) {
    const micBtn = document.getElementById('micBtn');
    if (micBtn) {
        micBtn.classList.toggle('active', active);
    }
}

// Chat Functions
function sendVoiceMessage() {
    const voiceInput = document.getElementById('voiceInput');
    if (!voiceInput || !voiceInput.value.trim()) return;
    const message = voiceInput.value.trim();
    voiceInput.value = '';
    addUserMessage(message);
    
    // Send to Rachel if connected
    if (isVoiceConnected && voiceWebSocket?.readyState === WebSocket.OPEN) {
        sendTextToVoice(message);
    } else {
        // Not connected - use local fallback and prompt to connect
        processOrderFromVoice(message);
        processUserMessage(message);
        showToast('Connect to Rachel for voice responses!', 'success');
    }
}

function handleVoiceInputEnter(event) {
    if (event.key === 'Enter') sendVoiceMessage();
}

function processUserMessage(message) {
    const lowerMessage = message.toLowerCase();
    const orderedItem = findMenuItemInMessage(lowerMessage);
    if (orderedItem) { addToCart(orderedItem.id, orderedItem.name, orderedItem.price); return; }
    
    if (lowerMessage.includes('menu') || lowerMessage.includes('what do you have')) {
        setTimeout(() => addAIMessage(`Here's what we have:\n\n🍔 BURGERS - Starting at $8.50\n🥤 SHAKES & DRINKS - Starting at $2.50\n🍟 SIDES - Starting at $2.50\n🍨 DESSERTS - Starting at $6.95\n\nWhat would you like?`), 500);
        return;
    }
    if (lowerMessage.includes('recommend') || lowerMessage.includes('suggest')) {
        setTimeout(() => addAIMessage(`I recommend the Hot Burger ($10.50) - it's our most popular! Or try the Deluxe Burger ($12.00) for the ultimate experience. Would you like to add one?`), 500);
        return;
    }
    if (lowerMessage.includes('checkout') || lowerMessage.includes('done') || lowerMessage.includes('that\'s all')) {
        if (AppState.cart.length > 0) {
            setTimeout(() => addAIMessage(`Perfect! You have ${AppState.cart.length} item(s) totaling $${getCartTotal().toFixed(2)}. Click checkout to review your order!`), 500);
        } else {
            setTimeout(() => addAIMessage("Your tray is empty! Would you like me to suggest some items?"), 500);
        }
        return;
    }
    setTimeout(() => addAIMessage(`I'd be happy to help! You can ask me about our menu, request recommendations, or just tell me what you'd like to order.`), 500);
}

function findMenuItemInMessage(message) {
    const allItems = [...AppState.menu.burgers, ...AppState.menu.shakes, ...AppState.menu.sides, ...AppState.menu.desserts];
    for (const item of allItems) {
        const itemNameLower = item.name.toLowerCase();
        if (message.includes(itemNameLower) || itemNameLower.split(' ').every(word => word.length > 3 && message.includes(word))) {
            return item;
        }
    }
    return null;
}

function addUserMessage(text) {
    const message = { type: 'user', text, timestamp: new Date().toISOString() };
    AppState.conversation.messages.push(message);
    saveState();
    renderMessage(message);
}

function addAIMessage(text) {
    const message = { type: 'ai', text, timestamp: new Date().toISOString() };
    AppState.conversation.messages.push(message);
    saveState();
    renderMessage(message);
}

function renderMessage(message) {
    const chatMessages = document.getElementById('chatMessages');
    if (!chatMessages) return;
    const messageEl = document.createElement('div');
    messageEl.className = `chat-message ${message.type === 'ai' ? 'ai-message' : 'user-message'}`;
    const time = new Date(message.timestamp);
    const timeStr = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    if (message.type === 'ai') {
        messageEl.innerHTML = `
            <div class="message-avatar"><div class="human-mini"><div class="human-mini-head"></div><div class="human-mini-body"></div></div></div>
            <div class="message-content">
                <span class="message-sender">TableTalk AI</span>
                <p>${message.text.replace(/\n/g, '<br>')}</p>
                <span class="message-time">${timeStr}</span>
            </div>
        `;
    } else {
        messageEl.innerHTML = `
            <div class="message-avatar"><div class="user-avatar">${AppState.user.name.charAt(0)}</div></div>
            <div class="message-content">
                <span class="message-sender">${AppState.user.name}</span>
                <p>${message.text}</p>
                <span class="message-time">${timeStr}</span>
            </div>
        `;
    }
    chatMessages.appendChild(messageEl);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function loadConversationHistory() {
    const chatMessages = document.getElementById('chatMessages');
    if (!chatMessages) return;
    chatMessages.innerHTML = '';
    AppState.conversation.messages.forEach(message => renderMessage(message));
}

// Order Page
function initOrderPage() {
    if (!AppState.user.isAuthenticated) { window.location.href = 'index.html'; return; }
    if (AppState.cart.length === 0) { window.location.href = 'menu.html'; return; }
    renderOrderItems();
    updateOrderTotals();
}

function renderOrderItems() {
    const orderItems = document.getElementById('orderItems');
    if (!orderItems) return;
    orderItems.innerHTML = AppState.cart.map(item => `
        <div class="order-item" data-id="${item.id}">
            <div class="order-item-left">
                <span class="order-item-name">${item.name}</span>
                <div class="order-item-qty">
                    <button class="order-qty-btn" onclick="updateOrderQuantity(${item.id}, -1)">-</button>
                    <span class="order-qty-value">${item.quantity}</span>
                    <button class="order-qty-btn" onclick="updateOrderQuantity(${item.id}, 1)">+</button>
                </div>
            </div>
            <span class="order-item-price">$${(item.price * item.quantity).toFixed(2)}</span>
        </div>
    `).join('');
}

function updateOrderQuantity(id, delta) {
    const item = AppState.cart.find(item => item.id === id);
    if (!item) return;
    item.quantity += delta;
    if (item.quantity <= 0) AppState.cart = AppState.cart.filter(i => i.id !== id);
    saveState();
    if (AppState.cart.length === 0) { window.location.href = 'menu.html'; return; }
    renderOrderItems();
    updateOrderTotals();
}

function updateOrderTotals() {
    const subtotal = getCartTotal();
    const tax = subtotal * 0.08;
    const total = subtotal + tax;
    const orderSubtotal = document.getElementById('orderSubtotal');
    const orderTax = document.getElementById('orderTax');
    const orderTotal = document.getElementById('orderTotal');
    if (orderSubtotal) orderSubtotal.textContent = `$${subtotal.toFixed(2)}`;
    if (orderTax) orderTax.textContent = `$${tax.toFixed(2)}`;
    if (orderTotal) orderTotal.textContent = `$${total.toFixed(2)}`;
}

function editOrder() { window.location.href = 'menu.html'; }

async function confirmOrder() {
    const confirmBtn = document.getElementById('confirmOrderBtn');
    if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.innerHTML = '<span>Processing...</span>'; }
    
    try {
        const orderData = {
            table_code: AppState.user.accessCode,
            items: AppState.cart.map(item => ({ menu_item_id: item.id, quantity: item.quantity, notes: null }))
        };
        const response = await fetch(`${API_BASE}/api/orders`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(orderData)
        });
        if (!response.ok) throw new Error('Order failed');
        const order = await response.json();
        
        const modal = document.getElementById('confirmationModal');
        const orderNumberEl = document.getElementById('orderNumber');
        if (orderNumberEl) orderNumberEl.textContent = order.id;
        if (modal) modal.classList.add('active');
        
        AppState.cart = [];
        AppState.conversation.step = 1;
        AppState.conversation.messages = [];
        saveState();
    } catch (error) {
        showToast('Failed to place order. Please try again.', 'error');
        if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.innerHTML = '<span>Confirm Order</span>'; }
    }
}

function newOrder() {
    AppState.conversation.step = 1;
    AppState.conversation.messages = [];
    saveState();
    window.location.href = 'menu.html';
}

// Sign Out
function signOut() {
    Storage.clear();
    AppState.user = { name: 'Guest', accessCode: null, isAuthenticated: false };
    AppState.cart = [];
    AppState.conversation = { step: 0, messages: [], isListening: false };
    window.location.href = 'index.html';
}

// Toast
function showToast(message, type = 'success') {
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <svg class="toast-icon" viewBox="0 0 20 20" fill="currentColor">
            ${type === 'success'
                ? '<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>'
                : '<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>'
            }
        </svg>
        <span class="toast-message">${message}</span>
    `;
    container.appendChild(toast);
    setTimeout(() => { toast.style.animation = 'slideIn 0.3s ease reverse'; setTimeout(() => toast.remove(), 300); }, 3000);
}

// Global exports
window.addToCart = addToCart;
window.removeFromCart = removeFromCart;
window.increaseQuantity = increaseQuantity;
window.decreaseQuantity = decreaseQuantity;
window.goToCheckout = goToCheckout;
window.toggleVoiceAI = toggleVoiceAI;
window.toggleMic = toggleMic;
window.toggleSideNav = toggleSideNav;
window.sendVoiceMessage = sendVoiceMessage;
window.handleVoiceInputEnter = handleVoiceInputEnter;
window.editOrder = editOrder;
window.confirmOrder = confirmOrder;
window.newOrder = newOrder;
window.updateOrderQuantity = updateOrderQuantity;
window.signOut = signOut;
window.showToast = showToast;
