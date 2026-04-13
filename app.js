import { CONFIG } from './config.js';

// ---- 全局狀態 ----
const STATE = {
    user: { name: '', role: 'user' }, // role: 'user' | 'admin'
    tokenClient: null,
    accessToken: null,
    settings: {}, // { TodayRestaurant: 'R01' }
    restaurants: {}, // { R01: 'McDonalds' }
    menu: [],
    todayDateStr: new Date().toISOString().split('T')[0],
    currentOrderItem: null // 正在點擊的餐點資料
};

// ---- DOM 節點 ----
const DOM = {
    loginView: document.getElementById('login-container'),
    appView: document.getElementById('app-container'),
    authBtn: document.getElementById('auth-btn'),
    userNameInput: document.getElementById('user-name'),
    roleSelect: document.getElementById('role-select'),
    loader: document.querySelector('.loader'),
    btnText: document.querySelector('.btn-text'),
    logoutBtn: document.getElementById('logout-btn'),

    displayRole: document.getElementById('display-role'),
    displayName: document.getElementById('display-name'),

    navBtns: document.querySelectorAll('.nav-btn[data-target]'),
    sections: document.querySelectorAll('.view-section'),
    adminOnlyEls: document.querySelectorAll('.admin-only'),

    menuContainer: document.getElementById('menu-container'),
    todayResName: document.getElementById('today-restaurant-name'),
    dateDisplay: document.getElementById('date-display'),

    // modal
    orderModal: document.getElementById('order-modal'),
    modalClose: document.getElementById('modal-close'),
    modalItemName: document.getElementById('modal-item-name'),
    modalItemPrice: document.getElementById('modal-item-price'),
    customizationsContainer: document.getElementById('customizations-container'),
    qtyInput: document.getElementById('order-quantity'),
    qtyPlus: document.getElementById('qty-plus'),
    qtyMinus: document.getElementById('qty-minus'),
    remarksInput: document.getElementById('order-remarks'),
    modalTotalPrice: document.getElementById('modal-total-price'),
    btnSubmitOrder: document.getElementById('btn-submit-order'),

    // orders view
    ordersTableBody: document.getElementById('orders-table-body'),
    myTotalCost: document.getElementById('my-total-cost'),
    allTotalCost: document.getElementById('all-total-cost'),

    // admin panel
    adminResSelect: document.getElementById('admin-restaurant-select'),
    btnSaveRes: document.getElementById('btn-save-restaurant'),
    btnOpenGSheet: document.getElementById('btn-open-gsheet'),
    orderSummaryText: document.getElementById('order-summary-text'),
    btnCopySummary: document.getElementById('btn-copy-summary'),
    btnClearOld: document.getElementById('btn-clear-old')
};

// ---- 工具函數 ----
const showToast = (msg, isError = false) => {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.className = `toast ${isError ? 'toast-error' : ''}`;
    setTimeout(() => toast.classList.add('hidden'), 3000);
};

const setLoading = (isLoading) => {
    if (isLoading) {
        DOM.loader.classList.remove('hidden');
        DOM.btnText.classList.add('hidden');
        DOM.authBtn.disabled = true;
    } else {
        DOM.loader.classList.add('hidden');
        DOM.btnText.classList.remove('hidden');
        DOM.authBtn.disabled = false;
    }
};

const switchView = (targetId) => {
    DOM.sections.forEach(sec => sec.classList.remove('active'));
    document.getElementById(targetId).classList.add('active');
    DOM.navBtns.forEach(btn => {
        if(btn.dataset.target === targetId) btn.classList.add('active');
        else btn.classList.remove('active');
    });

    if (targetId === 'orders-view') loadTodayOrders();
    if (targetId === 'admin-panel') loadAdminSummary();
};

// ---- 初始化與認證 ----
function initGoogleAPI() {
    // 給予日期顯示
    const d = new Date();
    DOM.dateDisplay.textContent = `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日 菜單清單`;

    DOM.btnOpenGSheet.href = `https://docs.google.com/spreadsheets/d/${CONFIG.SPREADSHEET_ID}/edit`;

    STATE.tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CONFIG.CLIENT_ID,
        scope: CONFIG.SCOPES,
        callback: (tokenResponse) => {
            if (tokenResponse && tokenResponse.access_token) {
                STATE.accessToken = tokenResponse.access_token;
                gapi.load('client', startApp);
            }
        },
    });
}
window.onload = initGoogleAPI; // 等候 gapi script 載入

DOM.authBtn.addEventListener('click', () => {
    const name = DOM.userNameInput.value.trim();
    if (!name) return showToast('請輸入您的稱呼！', true);
    STATE.user.name = name;
    STATE.user.role = DOM.roleSelect.value;
    
    setLoading(true);
    STATE.tokenClient.requestAccessToken({prompt: ''});
});

async function startApp() {
    try {
        await gapi.client.init({
            discoveryDocs: CONFIG.DISCOVERY_DOCS,
        });
        gapi.client.setToken({ access_token: STATE.accessToken });
        
        // 介面轉換
        DOM.loginView.classList.add('hidden');
        DOM.appView.classList.remove('hidden');
        DOM.displayName.textContent = STATE.user.name;
        DOM.displayRole.textContent = STATE.user.role === 'admin' ? '管理員' : '一般用戶';
        
        if (STATE.user.role === 'admin') {
            DOM.adminOnlyEls.forEach(el => el.classList.remove('hidden'));
        } else {
            DOM.adminOnlyEls.forEach(el => el.classList.add('hidden'));
            // 避免一般用戶強制切換
            DOM.navBtns.forEach(btn => {
                if(btn.dataset.target === 'admin-panel') btn.style.display = 'none';
            })
        }

        // 載入資料
        await fetchData();

    } catch (err) {
        setLoading(false);
        showToast('初始化失敗，請檢查 API 設定與試算表權限。', true);
        console.error(err);
    }
}

// ---- 資料存取 ----
async function fetchData() {
    try {
        const response = await gapi.client.sheets.spreadsheets.values.batchGet({
            spreadsheetId: CONFIG.SPREADSHEET_ID,
            ranges: [CONFIG.RANGES.SETTINGS, CONFIG.RANGES.RESTAURANTS, CONFIG.RANGES.MENU]
        });
        
        const valueRanges = response.result.valueRanges;
        
        // Parse Settings
        let settingsRows = valueRanges[0].values || [];
        STATE.settings = {};
        settingsRows.forEach(row => {
            if (row[0]) STATE.settings[row[0]] = row[1] || '';
        });

        // Parse Restaurants
        let resRows = valueRanges[1].values || [];
        STATE.restaurants = {};
        resRows.forEach(row => {
            if (row[0]) STATE.restaurants[row[0]] = row[1] || '';
        });

        // Parse Menu
        let menuRows = valueRanges[2].values || [];
        STATE.menu = menuRows.map(row => ({
            id: row[0],
            resId: row[1],
            name: row[2],
            price: parseInt(row[3]) || 0,
            customizations: row[4] || ''
        }));

        renderDashboard();
        renderAdminPanel();
    } catch (err) {
        showToast('載入資料失敗', true);
        console.error(err);
    }
}

// ---- 首頁點餐渲染 ----
function renderDashboard() {
    DOM.menuContainer.innerHTML = '';
    const todayResId = STATE.settings['TodayRestaurant'];
    
    if (!todayResId) {
        DOM.todayResName.textContent = "尚未設定";
        DOM.menuContainer.innerHTML = '<p class="text-sm">管理員尚未設定今日餐廳。</p>';
        return;
    }

    DOM.todayResName.textContent = STATE.restaurants[todayResId] || todayResId;
    
    const todayMenu = STATE.menu.filter(m => m.resId === todayResId);
    if (todayMenu.length === 0) {
        DOM.menuContainer.innerHTML = '<p class="text-sm">該餐廳尚未建置餐點。</p>';
        return;
    }

    todayMenu.forEach(item => {
        const card = document.createElement('div');
        card.className = 'menu-card glass-panel';
        card.innerHTML = `
            <div>
                <h3>${item.name}</h3>
            </div>
            <div class="card-footer">
                <span class="price">$${item.price}</span>
                <button class="add-btn" data-id="${item.id}">+</button>
            </div>
        `;
        card.addEventListener('click', () => openOrderModal(item));
        DOM.menuContainer.appendChild(card);
    });
}

// ---- Modal 點餐邏輯 ----
function openOrderModal(item) {
    STATE.currentOrderItem = item;
    DOM.modalItemName.textContent = item.name;
    DOM.modalItemPrice.textContent = `$${item.price}`;
    DOM.qtyInput.value = 1;
    DOM.remarksInput.value = '';
    updateModalPrice();

    // 處理客製化
    DOM.customizationsContainer.innerHTML = '';
    if (item.customizations) {
        // 解析格式: 甜度:正常甜,少糖,無糖;冰塊:正常冰,少冰
        const groups = item.customizations.split(';');
        groups.forEach(g => {
            const parts = g.split(':');
            if (parts.length === 2) {
                const labelName = parts[0].trim();
                const options = parts[1].split(',').map(o=>o.trim());
                
                const groupDiv = document.createElement('div');
                groupDiv.className = 'form-group';
                groupDiv.innerHTML = `<label>${labelName}</label>`;
                
                const select = document.createElement('select');
                select.className = 'custom-select';
                select.dataset.label = labelName;
                options.forEach(opt => {
                    const optionTag = document.createElement('option');
                    optionTag.value = opt;
                    optionTag.textContent = opt;
                    select.appendChild(optionTag);
                });
                groupDiv.appendChild(select);
                DOM.customizationsContainer.appendChild(groupDiv);
            }
        });
    }

    DOM.orderModal.classList.remove('hidden');
}

function updateModalPrice() {
    if (!STATE.currentOrderItem) return;
    const qty = parseInt(DOM.qtyInput.value) || 1;
    DOM.modalTotalPrice.textContent = `$${STATE.currentOrderItem.price * qty}`;
}

DOM.qtyPlus.addEventListener('click', () => { DOM.qtyInput.value = parseInt(DOM.qtyInput.value) + 1; updateModalPrice(); });
DOM.qtyMinus.addEventListener('click', () => { if(DOM.qtyInput.value > 1) { DOM.qtyInput.value = parseInt(DOM.qtyInput.value) - 1; updateModalPrice(); }});
DOM.qtyInput.addEventListener('change', updateModalPrice);

DOM.modalClose.addEventListener('click', () => {
    DOM.orderModal.classList.add('hidden');
});

DOM.btnSubmitOrder.addEventListener('click', async () => {
    if (!STATE.currentOrderItem) return;
    const item = STATE.currentOrderItem;
    const qty = parseInt(DOM.qtyInput.value) || 1;
    const total = qty * item.price;
    const remarks = DOM.remarksInput.value.trim();
    
    // 收集客製化
    let customArr = [];
    document.querySelectorAll('.custom-select').forEach(sel => {
        customArr.push(`${sel.value}`);
    });
    let customText = customArr.join(' / ');
    if (remarks) customText += ` (備註: ${remarks})`;

    const orderId = 'ORD-' + Date.now();
    const rowData = [
        orderId, 
        STATE.todayDateStr,
        STATE.user.name,
        DOM.todayResName.textContent,
        item.name,
        customText,
        qty,
        total
    ];

    DOM.btnSubmitOrder.disabled = true;
    DOM.btnSubmitOrder.textContent = '送出中...';

    try {
        await gapi.client.sheets.spreadsheets.values.append({
            spreadsheetId: CONFIG.SPREADSHEET_ID,
            range: 'Orders!A:H',
            valueInputOption: 'USER_ENTERED',
            insertDataOption: 'INSERT_ROWS',
            resource: { values: [rowData] }
        });
        showToast('訂單送出成功！');
        DOM.orderModal.classList.add('hidden');
    } catch (err) {
        showToast('送出失敗', true);
        console.error(err);
    } finally {
        DOM.btnSubmitOrder.disabled = false;
        DOM.btnSubmitOrder.textContent = '確認送出訂單';
    }
});

// ---- 今日訂單邏輯 ----
async function loadTodayOrders() {
    DOM.ordersTableBody.innerHTML = '<tr><td colspan="5" style="text-align:center;">載入中...</td></tr>';
    try {
        const response = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: CONFIG.SPREADSHEET_ID,
            range: CONFIG.RANGES.ORDERS
        });
        
        let rows = response.result.values || [];
        // [OrderID, Date, UserName, ResName, ItemName, Custom, Qty, Total]
        
        let myTotal = 0;
        let allTotal = 0;
        let tableHTML = '';
        
        // 過濾今日
        const todayRows = rows.filter(row => row[1] === STATE.todayDateStr && row[3] === DOM.todayResName.textContent);
        
        todayRows.forEach(row => {
            const userName = row[2] || '';
            const itemName = row[4] || '';
            const custom = row[5] || '';
            const qty = row[6] || '1';
            const cost = parseInt(row[7]) || 0;
            
            allTotal += cost;
            if (userName === STATE.user.name) myTotal += cost;
            
            tableHTML += `
                <tr>
                    <td>${userName}</td>
                    <td>${itemName}</td>
                    <td class="text-sm">${custom}</td>
                    <td>${qty}</td>
                    <td class="highlight">$${cost}</td>
                </tr>
            `;
        });
        
        if (todayRows.length === 0) {
            tableHTML = '<tr><td colspan="5" style="text-align:center;">今日尚無人點餐。</td></tr>';
        }
        
        DOM.ordersTableBody.innerHTML = tableHTML;
        DOM.myTotalCost.textContent = `$${myTotal}`;
        DOM.allTotalCost.textContent = `$${allTotal}`;

    } catch (err) {
        DOM.ordersTableBody.innerHTML = '<tr><td colspan="5">載入錯誤</td></tr>';
        console.error(err);
    }
}

// ---- 管理員邏輯 ----
function renderAdminPanel() {
    DOM.adminResSelect.innerHTML = '<option value="">請選擇餐廳</option>';
    Object.keys(STATE.restaurants).forEach(id => {
        const opt = document.createElement('option');
        opt.value = id;
        opt.textContent = STATE.restaurants[id];
        if (STATE.settings['TodayRestaurant'] === id) opt.selected = true;
        DOM.adminResSelect.appendChild(opt);
    });
}

DOM.btnSaveRes.addEventListener('click', async () => {
    const selectedRes = DOM.adminResSelect.value;
    if (!selectedRes) return showToast('請選擇餐廳', true);
    
    DOM.btnSaveRes.disabled = true;
    try {
        // 先抓 Settings 所有列來找 TodayRestaurant 在第幾列，為了簡化，實作時我們以覆蓋特定範圍更保險
        // 但安全作法是呼叫 batchUpdate 或找尋鍵值。
        // 為避免太複雜，預設我們要求設定檔把 TodayRestaurant 放在 Settings 的第一行紀錄中 (A2:B2)
        // 較好的作法是直接去找 A 欄等於 TodayRestaurant 的 index，然後 update 它的 B 欄
        
        const response = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: CONFIG.SPREADSHEET_ID,
            range: 'Settings!A:B'
        });
        const rows = response.result.values || [];
        let rowIndex = -1;
        for(let i=0; i<rows.length; i++) {
            if(rows[i][0] === 'TodayRestaurant') { rowIndex = i + 1; break; }
        }
        
        if(rowIndex > 0) {
            await gapi.client.sheets.spreadsheets.values.update({
                spreadsheetId: CONFIG.SPREADSHEET_ID,
                range: `Settings!B${rowIndex}`,
                valueInputOption: 'USER_ENTERED',
                resource: { values: [[selectedRes]] }
            });
        } else {
            // 新增一行
            await gapi.client.sheets.spreadsheets.values.append({
                spreadsheetId: CONFIG.SPREADSHEET_ID,
                range: 'Settings!A:B',
                valueInputOption: 'USER_ENTERED',
                insertDataOption: 'INSERT_ROWS',
                resource: { values: [['TodayRestaurant', selectedRes]] }
            });
        }

        STATE.settings['TodayRestaurant'] = selectedRes;
        renderDashboard(); // 重新渲染今日菜單
        showToast('發布成功！大家重新載入即可看到新菜單');

    } catch (err) {
        showToast('設定失敗', true);
        console.error(err);
    } finally {
        DOM.btnSaveRes.disabled = false;
    }
});

async function loadAdminSummary() {
    try {
        const response = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: CONFIG.SPREADSHEET_ID,
            range: CONFIG.RANGES.ORDERS
        });
        let rows = response.result.values || [];
        const todayRows = rows.filter(row => row[1] === STATE.todayDateStr && row[3] === DOM.todayResName.textContent);
        
        let summary = `【${DOM.todayResName.textContent} 點餐明細】\n`;
        let grandTotal = 0;
        todayRows.forEach(row => {
            const userName = row[2] || '';
            const itemName = row[4] || '';
            const custom = row[5] ? `(${row[5]})` : '';
            const qty = row[6] || 1;
            const cost = parseInt(row[7]) || 0;
            grandTotal += cost;
            summary += `${userName}：${itemName}${custom} x${qty} ($${cost})\n`;
        });
        summary += `\n結算總金額：$${grandTotal}`;
        DOM.orderSummaryText.value = summary;
    } catch(e) {}
}

DOM.btnCopySummary.addEventListener('click', () => {
    DOM.orderSummaryText.select();
    document.execCommand('copy');
    showToast('已複製明細內容！');
});

DOM.btnClearOld.addEventListener('click', async () => {
    if(!confirm('這將刪除所有「非今日」或「非當前餐廳」的訂單，確定嗎？')) return;
    
    // 這個實作需要去讀取所有行，過濾掉不要的，然後清空並覆寫。
    DOM.btnClearOld.disabled = true;
    try {
        const response = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: CONFIG.SPREADSHEET_ID,
            range: 'Orders!A:H'
        });
        let rows = response.result.values || [];
        
        // 假設第一行是標題，我們保留！
        const titleRow = rows[0]; 
        const keepRows = rows.filter((row, i) => i === 0 || (row[1] === STATE.todayDateStr));
        
        // 清空整個表
        await gapi.client.sheets.spreadsheets.values.clear({
            spreadsheetId: CONFIG.SPREADSHEET_ID,
            range: 'Orders!A:H'
        });
        
        // 重新寫入我們保留的 row
        if (keepRows.length > 0) {
            await gapi.client.sheets.spreadsheets.values.update({
                spreadsheetId: CONFIG.SPREADSHEET_ID,
                range: 'Orders!A1',
                valueInputOption: 'USER_ENTERED',
                resource: { values: keepRows }
            });
        }
        showToast('清理完成');
    } catch(err) {
        showToast('清理失敗', true);
        console.error(err);
    } finally {
        DOM.btnClearOld.disabled = false;
    }
});


// ---- 導航事件 ----
DOM.navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        if (!btn.dataset.target) return;
        switchView(btn.dataset.target);
    });
});

DOM.logoutBtn.addEventListener('click', () => {
    DOM.appView.classList.add('hidden');
    DOM.loginView.classList.remove('hidden');
    gapi.client.setToken('');
    STATE.accessToken = null;
    showToast('已登出');
});
