// ═══════════════════════════════════════════
//  SAOD — Smart Automated Order & Delivery
//  Local Database (js/database.js)
// ═══════════════════════════════════════════

const DB = {
  keys: ['users', 'products', 'orders', 'payments', 'deliveries', 'id_seq'],
  data: null,
  persistTimer: null,
  persistWarningShown: false,
  clone(value) {
    return JSON.parse(JSON.stringify(value));
  },
  defaults() {
    return this.clone(window.SAOD_LOCAL_DATABASE || {
      users: [],
      products: [],
      orders: [],
      payments: [],
      deliveries: [],
      id_seq: { users: 0, products: 0, orders: 0, payments: 0, deliveries: 0 }
    });
  },
  get(k) {
    if (!this.data) this.data = this.defaults();
    return this.data[k] === undefined ? null : this.clone(this.data[k]);
  },
  set(k, v) {
    if (!this.data) this.data = this.defaults();
    this.data[k] = this.clone(v);
    window.SAOD_LOCAL_DATABASE = this.clone(this.data);
    this.schedulePersist();
  },
  init() {
    const defaults = this.defaults();
    this.data = defaults;
    this.keys.forEach(key => {
      if (this.data[key] === undefined || this.data[key] === null) this.data[key] = defaults[key];
    });
    this.mergeDefaults('users', defaults.users);
    this.mergeDefaults('products', defaults.products);

    // Seed default admin account
    const users = this.get('users');
    if (!users.find(u => u.email === 'admin@saod.com')) {
      users.push({ id: 'USR-000', name: 'Admin', email: 'admin@saod.com', password: 'admin123', role: 'admin', joined: now() });
      this.set('users', users);
    }
    this.syncSequences();
    this.removeLegacyLocalStorage();
  },
  removeLegacyLocalStorage() {
    Object.keys(localStorage)
      .filter(key => key.startsWith('saod_') || key === 'currentUser')
      .forEach(key => localStorage.removeItem(key));
  },
  mergeDefaults(key, records) {
    if (!Array.isArray(records) || !records.length) return;
    const current = this.data[key] || [];
    let changed = false;

    records.forEach(record => {
      if (!current.some(item => item.id === record.id)) {
        current.push(this.clone(record));
        changed = true;
      }
    });

    if (changed) this.data[key] = current;
  },
  syncSequences() {
    const seq = this.get('id_seq') || {};
    const collections = {
      users: this.get('users') || [],
      products: this.get('products') || [],
      orders: this.get('orders') || [],
      payments: this.get('payments') || [],
      deliveries: this.get('deliveries') || []
    };

    Object.entries(collections).forEach(([type, items]) => {
      const maxId = items.reduce((max, item) => {
        const idNumber = parseInt(String(item.id || '').split('-')[1], 10);
        return Number.isNaN(idNumber) ? max : Math.max(max, idNumber);
      }, 0);
      seq[type] = Math.max(seq[type] || 0, maxId);
    });
    this.set('id_seq', seq);
  },
  schedulePersist() {
    clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => this.persist(), 150);
  },
  persist() {
    if (!location.protocol.startsWith('http')) {
      this.showPersistWarning();
      return;
    }

    fetch('/api/database', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(this.data)
    }).catch(() => this.showPersistWarning());
  },
  showPersistWarning() {
    if (this.persistWarningShown) return;
    this.persistWarningShown = true;
    console.warn('Database changes are in memory only. Run the app with node server.js to save changes into js/database.js.');
  },
  nextId(type) {
    const seq = this.get('id_seq');
    seq[type] = (seq[type] || 0) + 1;
    this.set('id_seq', seq);
    const prefix = { users: 'USR', products: 'PRD', orders: 'ORD', payments: 'PAY', deliveries: 'DLV' }[type];
    return prefix + '-' + String(seq[type]).padStart(3, '0');
  }
};

function now() {
  return new Date().toLocaleString('en-PH', { dateStyle: 'short', timeStyle: 'short' });
}

let currentUser = null;
let selectedCategory = null;
const HANDLING_FEE = 30;

function orderHasVendor(order, vendorId) {
  return order.vendorId === vendorId ||
    (order.vendorIds || []).includes(vendorId) ||
    (order.items || []).some(item => item.vendorId === vendorId);
}

function deliveryHasVendor(delivery, vendorId) {
  return delivery.vendorId === vendorId ||
    (delivery.vendorIds || []).includes(vendorId) ||
    (delivery.items || []).some(item => item.vendorId === vendorId);
}

function deliveryOptionsHtml(companies) {
  return `<option value="">Choose Delivery Option</option><option value="PICKUP">Pick up</option>${companies.map(c => `<option value="${c}">${c}</option>`).join('')}`;
}

function isPickupOption(option) {
  return option === 'PICKUP';
}

function setPaymentOptions(selectId, isPickup) {
  const paymentEl = document.getElementById(selectId);
  if (!paymentEl) return;

  const currentValue = paymentEl.value;
  const options = isPickup
    ? [
        { value: 'GCash', label: 'GCash' },
        { value: 'Cash', label: 'Cash' }
      ]
    : [
        { value: 'COD', label: 'Cash on Delivery' },
        { value: 'GCash', label: 'GCash' }
      ];

  paymentEl.innerHTML = options.map(option => `<option value="${option.value}">${option.label}</option>`).join('');
  paymentEl.value = options.some(option => option.value === currentValue) ? currentValue : options[0].value;
  handlePaymentChange(selectId);
}

function setPickupFormState(addressId, riderId, option) {
  const isPickup = isPickupOption(option);
  const addressEl = document.getElementById(addressId);
  const riderEl = document.getElementById(riderId);

  if (addressEl) {
    addressEl.disabled = isPickup;
    addressEl.placeholder = isPickup ? 'No delivery address needed for pickup' : 'Enter delivery address';
    if (isPickup) addressEl.value = '';
  }

  if (riderEl && isPickup) {
    riderEl.innerHTML = `<option value="">No rider needed for pickup</option>`;
    riderEl.value = '';
    riderEl.disabled = true;
  } else if (riderEl) {
    riderEl.disabled = false;
  }
}

// ═══════════════════════════════════════════
//  AUTH
// ═══════════════════════════════════════════

function switchTab(t) {
  document.querySelectorAll('.auth-tab').forEach((el, i) =>
    el.classList.toggle('active', i === (t === 'login' ? 0 : 1))
  );
  document.getElementById('login-form').classList.toggle('active', t === 'login');
  document.getElementById('register-form').classList.toggle('active', t === 'register');

  if (t === 'login') {
    clearLoginForm();
  } else {
    clearRegisterForm();
  }
}

function clearLoginForm() {
  document.getElementById('login-email').value = '';
  document.getElementById('login-pass').value = '';
  document.getElementById('login-msg').textContent = '';
}

function clearRegisterForm() {
  document.getElementById('reg-name').value = '';
  document.getElementById('reg-email').value = '';
  document.getElementById('reg-pass').value = '';
  document.getElementById('reg-company').value = '';
  document.getElementById('reg-msg').textContent = '';
  document.querySelectorAll('.role-card').forEach((c, i) => {
    c.classList.toggle('selected', i === 0);
  });
  const label = document.getElementById('reg-name-label');
  if (label) {
    label.textContent = 'Full Name';
  }
  document.getElementById('reg-company-group').style.display = 'none';
}

function selectRole(el) {
  document.querySelectorAll('.role-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  const role = el.dataset.role;
  const label = document.getElementById('reg-name-label');
  if (label) {
    label.textContent = role === 'rider' ? 'Full Name' : 'Full Name';
  }
  document.getElementById('reg-company-group').style.display = role === 'rider' ? 'block' : 'none';
}

function showMsg(id, text, type = 'error') {
  const el = document.getElementById(id);
  el.className = 'msg msg-' + (type === 'success' ? 'success' : 'error');
  el.textContent = text;
}

function register() {
  const name  = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const pass  = document.getElementById('reg-pass').value;
  const role  = document.querySelector('.role-card.selected')?.dataset.role || 'customer';
  const company = role === 'rider' ? document.getElementById('reg-company').value.trim() : null;

  if (!name || !email || !pass) return showMsg('reg-msg', 'Please fill in all fields.');
  if (pass.length < 6)         return showMsg('reg-msg', 'Password must be at least 6 characters.');
  if (role === 'rider' && !company) return showMsg('reg-msg', 'Please enter your company/employer name.');

  const users = DB.get('users');
  if (users.find(u => u.email === email)) return showMsg('reg-msg', 'Email already registered.');

  const user = { id: DB.nextId('users'), name, email, password: pass, role, joined: now() };
  if (role === 'rider') user.company = company;

  users.push(user);
  DB.set('users', users);
  showMsg('reg-msg', 'Account created! You can now sign in.', 'success');
  setTimeout(() => {
    clearRegisterForm();
    switchTab('login');
  }, 1200);
}

function login() {
  const email = document.getElementById('login-email').value.trim();
  const pass  = document.getElementById('login-pass').value;
  const users = DB.get('users');
  const user  = users.find(u => u.email === email && u.password === pass);

  if (!user) return showMsg('login-msg', 'Invalid email or password.');

  currentUser = user;
  sessionStorage.setItem('currentUser', JSON.stringify(user));
  showApp(user);
}

function showApp(user) {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
  document.getElementById('hdr-name').textContent    = user.name;
  document.getElementById('hdr-initial').textContent = user.name[0].toUpperCase();
  document.getElementById('hdr-role').textContent    = user.role.charAt(0).toUpperCase() + user.role.slice(1);

  // Role-based UI
  const isVendorOrAdmin = user.role === 'admin' || user.role === 'vendor';
  document.getElementById('btn-add-product').style.display = isVendorOrAdmin ? '' : 'none';
  document.getElementById('nav-users').style.display = user.role === 'admin' ? '' : 'none';
  document.getElementById('nav-cart').style.display = user.role === 'customer' ? '' : 'none';
  document.getElementById('nav-products').style.display = user.role === 'rider' ? 'none' : '';
  document.getElementById('nav-delivery').style.display = user.role === 'rider' || user.role === 'admin' ? '' : 'none';

  showPage('dashboard');
}

function logout() {
  currentUser = null;
  sessionStorage.removeItem('currentUser');
  document.getElementById('auth-screen').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
  document.getElementById('login-email').value = '';
  document.getElementById('login-pass').value  = '';
  document.getElementById('login-msg').textContent = '';
  document.getElementById('nav-users').style.display = 'none';
  document.getElementById('nav-cart').style.display = 'none';
}

// ═══════════════════════════════════════════
//  NAVIGATION
// ═══════════════════════════════════════════

function showPage(p) {
  document.querySelectorAll('.page').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  document.getElementById('page-' + p).classList.add('active');
  const navEl = document.getElementById('nav-' + p);
  if (navEl) navEl.classList.add('active');
  if (renders[p]) renders[p]();
}

// ═══════════════════════════════════════════
//  PAGE RENDERERS
// ═══════════════════════════════════════════

const renders = {

  dashboard() {
    const u = currentUser;
    document.getElementById('dash-welcome').textContent =
      `Welcome back, ${u.name}! Here's what's happening today.`;

    const orders   = DB.get('orders');
    const products = DB.get('products');
    const users    = DB.get('users');
    const deliveries = DB.get('deliveries');

    const myOrders =
      u.role === 'customer' ? orders.filter(o => o.customerId === u.id) :
      u.role === 'vendor'   ? orders.filter(o => orderHasVendor(o, u.id)) :
      u.role === 'rider'    ? orders.filter(o => deliveries.some(d => d.orderId === o.id && d.riderId === u.id)) :
      orders;

    const myDeliveries = u.role === 'rider'
      ? deliveries.filter(d => d.riderId === u.id)
      : [];

    const myRevenue = myOrders
      .filter(o => o.status !== 'Cancelled')
      .reduce((s, o) => s + o.total, 0);

    const stats =
      u.role === 'admin'
        ? [
            { i: '🧾', v: orders.length,   l: 'Total Orders' },
            { i: '📦', v: products.length,  l: 'Products' },
            { i: '👥', v: users.length,     l: 'Users' },
            { i: '💰', v: '₱' + myRevenue.toFixed(2), l: 'Total Revenue' }
          ]
        : u.role === 'vendor'
        ? [
            { i: '🧾', v: myOrders.length, l: 'My Orders' },
            { i: '📦', v: products.filter(p => p.vendorId === u.id).length, l: 'My Products' },
            { i: '⏳', v: myOrders.filter(o => o.status === 'Pending').length, l: 'Pending' },
            { i: '💰', v: '₱' + myRevenue.toFixed(2), l: 'Revenue' }
          ]
        : u.role === 'rider'
        ? [
            { i: '🚚', v: myDeliveries.length, l: 'Total Deliveries' },
            { i: '⏳', v: myDeliveries.filter(d => d.status === 'Assigned' || d.status === 'Out for Delivery').length, l: 'Pending Deliveries' },
            { i: '✅', v: myDeliveries.filter(d => d.status === 'Delivered').length, l: 'Delivered' },
            { i: '📍', v: myDeliveries.filter(d => d.status === 'Out for Delivery').length, l: 'Out for Delivery' }
          ]
        : [
            { i: '🛒', v: myOrders.length, l: 'My Orders' },
            { i: '✅', v: myOrders.filter(o => o.status === 'Delivered').length, l: 'Delivered' },
            { i: '⏳', v: myOrders.filter(o => o.status === 'Pending').length,   l: 'Pending' },
            { i: '💳', v: myOrders.filter(o => o.payStatus === 'Paid').length,   l: 'Paid' }
          ];

    document.getElementById('stat-grid').innerHTML =
      stats.map(s => `
        <div class="stat-card">
          <div class="stat-icon">${s.i}</div>
          <div class="stat-val">${s.v}</div>
          <div class="stat-label">${s.l}</div>
        </div>`).join('');

    const recentOrders = u.role === 'rider'
      ? deliveries.filter(d => d.riderId === u.id).slice(-6).reverse()
      : myOrders.slice(-6).reverse();

    const isRider = u.role === 'rider';
    document.getElementById('dash-recent-orders').innerHTML = recentOrders.length
      ? recentOrders.map(item => {
          if (isRider) {
            const ord = orders.find(o => o.id === item.orderId);
            return `<tr>
              <td><b>${item.id}</b></td>
              <td>${item.orderId}</td>
              <td>${item.customerName}</td>
              <td>₱${ord ? ord.total.toFixed(2) : '0.00'}</td>
              <td><span class="badge ${delivBadge(item.status)}">${item.status}</span></td>
              <td>${item.timeline && item.timeline[0] ? item.timeline[0].time : 'N/A'}</td>
            </tr>`;
          }
          return `<tr>
            <td><b>${item.id}</b></td>
            <td>${item.productName}</td>
            <td>${item.customerName}</td>
            <td>₱${item.total.toFixed(2)}</td>
            <td><span class="badge ${statusBadge(item.status)}">${item.status}</span></td>
            <td>${item.date}</td>
          </tr>`;
        }).join('')
      : `<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">📭</div>No orders yet.</div></td></tr>`;

  },

  products() {
    const prods = DB.get('products');
    if (!currentUser) {
      const categories = ['Vegetables','Fruits','Meat & Poultry','Seafood','Dairy','Grains & Rice','Beverages','Snacks','Other'];
      const icons = { Vegetables: '🥦', Fruits: '🍓', 'Meat & Poultry': '🍗', Seafood: '🐟', Dairy: '🧀', 'Grains & Rice': '🌾', Beverages: '🥤', Snacks: '🍪', Other: '📦' };
      document.getElementById('category-grid').innerHTML = categories.map(c => `
        <div class="category-card ${selectedCategory === c ? 'selected' : ''}" onclick="selectCategory('${c.replace("'","\\'" )}')">
          <div class="cat-icon">${icons[c] || '📦'}</div>
          <div class="cat-label">${c.split(' ')[0]}</div>
        </div>`).join('');
      document.getElementById('products-table').innerHTML = `<div class="empty-state" style="padding:40px 24px"><div class="empty-icon">🔒</div>Please sign in to browse products.</div>`;
      return;
    }

    const myProds = currentUser.role === 'vendor'
      ? prods.filter(p => p.vendorId === currentUser.id)
      : prods;

    const categories = ['Vegetables','Fruits','Meat & Poultry','Seafood','Dairy','Grains & Rice','Beverages','Snacks','Other'];
    const icons = { Vegetables: '🥦', Fruits: '🍓', 'Meat & Poultry': '🍗', Seafood: '🐟', Dairy: '🧀', 'Grains & Rice': '🌾', Beverages: '🥤', Snacks: '🍪', Other: '📦' };

    document.getElementById('category-grid').innerHTML = categories.map(c => `
      <div class="category-card ${selectedCategory === c ? 'selected' : ''}" onclick="selectCategory('${c.replace("'","\\'" )}')">
        <div class="cat-icon">${icons[c] || '📦'}</div>
        <div class="cat-label">${c.split(' ')[0]}</div>
      </div>`).join('');

    const productsEl = document.getElementById('products-table');

    if (!selectedCategory && (currentUser.role === 'customer' || currentUser.role === 'vendor')) {
      productsEl.classList.remove('compact');
      productsEl.innerHTML = `<div class="empty-state" style="padding:60px 24px"><div class="empty-icon">🔎</div>Select a category to view products.</div>`;
      return;
    }

    const q = (document.getElementById('product-search')?.value || '').trim().toLowerCase();
    let filtered = selectedCategory ? myProds.filter(p => p.category === selectedCategory) : myProds;
    if (q) {
      filtered = filtered.filter(p => (
        (p.name || '').toLowerCase().includes(q) ||
        (p.desc || '').toLowerCase().includes(q) ||
        (p.category || '').toLowerCase().includes(q)
      ));
    }

    productsEl.classList.toggle('compact', !!selectedCategory);
    productsEl.innerHTML = filtered.length
      ? filtered.map(p => {
          const icon = {
            Vegetables: '🥦', Fruits: '🍓', 'Meat & Poultry': '🍗', Seafood: '🐟', Dairy: '🧀',
            'Grains & Rice': '🌾', Beverages: '🥤', Snacks: '🍪'
          }[p.category] || '📦';

          const stockUnit = p.stockUnit || 'unit';
          const priceUnit = p.priceUnit || 'per unit';

          return `
            <div class="product-card">
              <div class="product-image"><span>${icon}</span></div>
              <div class="product-card-body">
                <div class="product-header">
                  <div class="product-category">${p.category}</div>
                  <div class="product-stock ${p.stock > 0 ? 'badge-green' : 'badge-red'}">${p.stock > 0 ? 'In Stock' : 'Out of Stock'}</div>
                </div>
                <h3>${p.name}</h3>
                <p>${p.desc || 'No description available.'}</p>
                <div class="product-footer">
                  <div>
                    <div class="product-price">₱${parseFloat(p.price).toFixed(2)} <span style="font-size:11px;color:var(--muted);font-weight:500">${priceUnit}</span></div>
                    <div class="product-vendor">${p.vendorName}</div>
                    <div style="font-size:11px;color:var(--muted);margin-top:2px">Stock: ${p.stock} ${stockUnit}</div>
                  </div>
                  <div class="product-actions">
                    ${currentUser.role === 'customer' && p.stock > 0
                      ? `<button class="btn btn-primary btn-sm" onclick="openDirectOrder('${p.id}')">Order</button>
                         <button class="btn btn-outline btn-sm" onclick="openAddToCart('${p.id}')">Add Cart</button>`
                      : ''}
                    ${(currentUser.role === 'admin' || (currentUser.role === 'vendor' && currentUser.id === p.vendorId))
                      ? `<button class="btn btn-outline btn-sm" onclick="editProduct('${p.id}')">Edit</button>
                         <button class="btn btn-danger btn-sm" onclick="deleteProduct('${p.id}')">Delete</button>`
                      : ''}
                  </div>
                </div>
              </div>
            </div>`;
        }).join('')
      : `<div class="empty-state" style="padding:60px 24px"><div class="empty-icon">📦</div>No products found.</div>`;
  },

  orders() {
    const orders = DB.get('orders');
    const deliveries = DB.get('deliveries');
    const myOrders =
      currentUser.role === 'customer' ? orders.filter(o => o.customerId === currentUser.id) :
      currentUser.role === 'vendor'   ? orders.filter(o => orderHasVendor(o, currentUser.id)) :
      currentUser.role === 'rider'    ? orders.filter(o => {
        const delivery = deliveries.find(d => d.orderId === o.id);
        const isActive = o.status !== 'Delivered' && o.status !== 'Cancelled';
        return delivery && isActive && (!delivery.riderId || delivery.riderId === currentUser.id);
      }) :
      orders;

    // Adjust the orders table header depending on the current user's role
    const headerRow = document.querySelector('#page-orders table thead tr');
    if (headerRow) {
      headerRow.innerHTML = '<th>Order ID</th><th>Date</th><th>Status</th><th>Actions</th>';
    }

    document.getElementById('orders-table').innerHTML = myOrders.length
      ? myOrders.map(o => {
          const delivery = deliveries.find(d => d.orderId === o.id);
          const isOpenDelivery = currentUser.role === 'rider' && delivery && !delivery.riderId;
          const isClaimedByRider = currentUser.role === 'rider' && delivery && delivery.riderId === currentUser.id;
          const isPickup = (o.fulfillmentOption || '').toLowerCase() === 'pickup' || o.deliveryOption === 'Pickup';
          return `
          <tr>
            <td><b>${o.id}</b></td>
            <td>${o.date}</td>
            <td>
              <span class="badge ${statusBadge(o.status)}">${o.status}</span>
              ${isOpenDelivery ? '<span class="badge badge-gray" style="margin-left:4px">Open</span>' : ''}
              ${isClaimedByRider ? '<span class="badge badge-orange" style="margin-left:4px">Claimed</span>' : ''}
            </td>
            <td>
              <div class="actions-row" style="display:flex;flex-wrap:wrap;gap:6px;">
                <button class="btn btn-outline btn-sm" onclick="viewOrderDetail('${o.id}')">View</button>
                ${isOpenDelivery ? `<button class="btn btn-primary btn-sm" onclick="claimDelivery('${delivery.id}')">Choose Delivery</button>` : ''}
                ${(currentUser.role === 'admin' || currentUser.role === 'vendor') && o.status === 'Pending' && isPickup
                  ? `<button class="btn btn-primary btn-sm" onclick="updateOrderStatus('${o.id}','Ready for pickup')">Ready for pickup</button>` : ''}
                ${(currentUser.role === 'admin' || currentUser.role === 'vendor') && o.status === 'Pending' && !isPickup
                  ? `<button class="btn btn-primary btn-sm" onclick="updateOrderStatus('${o.id}','Processing')">Process</button>` : ''}
                ${(currentUser.role === 'admin' || currentUser.role === 'vendor') && o.status === 'Processing'
                  ? `<button class="btn btn-primary btn-sm" onclick="updateOrderStatus('${o.id}','Shipped')">Confirm Order</button>` : ''}
                ${o.status === 'Pending' && currentUser.id === o.customerId
                  ? `<button class="btn btn-danger btn-sm" onclick="cancelOrder('${o.id}')">Cancel</button>` : ''}
                ${o.status === 'Cancelled' && (currentUser.role === 'vendor' || currentUser.role === 'admin') && currentUser.id === o.vendorId
                  ? `<button class="btn btn-danger btn-sm" onclick="removeOrder('${o.id}')">Remove</button>` : ''}
              </div>
            </td>
          </tr>`;
        }).join('')
      : `<tr><td colspan="4"><div class="empty-state"><div class="empty-icon">📭</div>No orders yet.</div></td></tr>`;
    return;

    if (currentUser.role === 'rider') {
      document.getElementById('orders-table').innerHTML = myOrders.length
        ? myOrders.map(o => {
            const delivery = deliveries.find(d => d.orderId === o.id);
            const isMine = delivery && delivery.riderId === currentUser.id;
            const isOpen = delivery && !delivery.riderId;
            return `
            <tr>
              <td><b>${o.id}</b></td>
              <td>${o.productName}</td>
              <td>${o.qty} ${o.qtyUnit || 'unit'}</td>
              <td>₱${o.total.toFixed(2)}</td>
              <td>${o.customerName}</td>
              <td><span class="badge badge-blue">${o.payMethod}</span></td>
              <td>
                <span class="badge ${statusBadge(o.status)}">${o.status}</span>
                ${isOpen ? '<span class="badge badge-gray" style="margin-left:4px">Open</span>' : ''}
                ${isMine ? '<span class="badge badge-orange" style="margin-left:4px">Claimed</span>' : ''}
              </td>
              <td>
                <div class="actions-row" style="display:flex;flex-wrap:wrap;gap:6px;">
                  ${isOpen ? `<button class="btn btn-primary btn-sm" onclick="claimDelivery('${delivery.id}')">Choose Delivery</button>` : ''}
                  ${!isOpen ? '—' : ''}
                </div>
              </td>
            </tr>`;
          }).join('')
        : `<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">📭</div>No orders yet.</div></td></tr>`;
    } else {
      document.getElementById('orders-table').innerHTML = myOrders.length
        ? myOrders.map(o => {
            const delivery = deliveries.find(d => d.orderId === o.id);
            const vendorName = o.vendorName || (delivery ? delivery.vendorName : 'Unknown');
            return `
            <tr>
              <td><b>${o.id}</b></td>
              <td>${o.productName}</td>
              <td>${o.qty} ${o.qtyUnit || 'unit'}</td>
              <td>₱${o.total.toFixed(2)}</td>
              <td>${o.customerName}</td>
              <td>${vendorName}</td>
              <td><span class="badge badge-blue">${o.payMethod}</span></td>
              <td><span class="badge ${statusBadge(o.status)}">${o.status}</span></td>
              <td>
                <div class="actions-row" style="display:flex;flex-wrap:wrap;gap:6px;">
                  <button class="btn btn-outline btn-sm" onclick="viewOrderDetail('${o.id}')">👁 View</button>
                  ${(currentUser.role === 'admin' || currentUser.role === 'vendor') && o.status === 'Pending'
                    ? `<button class="btn btn-primary btn-sm" onclick="updateOrderStatus('${o.id}','Processing')">▶ Process</button>` : ''}
                  ${(currentUser.role === 'admin' || currentUser.role === 'vendor') && o.status === 'Processing'
                    ? `<button class="btn btn-primary btn-sm" onclick="updateOrderStatus('${o.id}','Shipped')">🚚 Ship</button>` : ''}
                  ${(currentUser.role === 'admin' || currentUser.role === 'rider') && o.status === 'Shipped'
                    ? `<button class="btn btn-primary btn-sm" onclick="updateOrderStatus('${o.id}','Delivered')">✅ Deliver</button>` : ''}
                  ${o.status === 'Pending' && currentUser.id === o.customerId
                    ? `<button class="btn btn-danger btn-sm" onclick="cancelOrder('${o.id}')">✖ Cancel</button>` : ''}
                  ${o.status === 'Cancelled' && (currentUser.role === 'vendor' || currentUser.role === 'admin') && currentUser.id === o.vendorId
                    ? `<button class="btn btn-danger btn-sm" onclick="removeOrder('${o.id}')">🗑 Remove</button>` : ''}
                </div>
              </td>
            </tr>`;
          }).join('')
        : `<tr><td colspan="9"><div class="empty-state"><div class="empty-icon">📭</div>No orders yet.</div></td></tr>`;
    }
  },

  cart() {
    const cart = getCart();
    const page = document.getElementById('cart-page-body');
    if (!cart.length) {
      page.innerHTML = `<div class="empty-state"><div class="empty-icon">🛒</div>Your cart is empty. Use Products to add items.</div>`;
      return;
    }

    const total = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
    page.innerHTML = `
      <div class="cart-grid">
        ${cart.map(item => `
          <div class="cart-item">
            <div>
              <div class="cart-title">${item.name}</div>
              <div class="cart-meta">${item.vendorName} • ₱${item.price.toFixed(2)} ${item.priceUnit || 'per unit'}</div>
            </div>
            <div class="cart-qty-controls">
              <button class="btn btn-outline btn-sm" onclick="updateCartQty('${item.id}', ${item.qty - 1})">-</button>
              <span>${item.qty} ${item.stockUnit || 'unit'}</span>
              <button class="btn btn-outline btn-sm" onclick="updateCartQty('${item.id}', ${item.qty + 1})">+</button>
            </div>
            <div class="cart-subtotal">₱${(item.price * item.qty).toFixed(2)}</div>
            <button class="btn btn-danger btn-sm" onclick="removeCartItem('${item.id}')">Remove</button>
          </div>`).join('')}
      </div>
      <div class="form-actions" style="justify-content:space-between;align-items:center;flex-wrap:wrap;margin-top:24px">
        <div style="font-weight:700;font-size:14px">Total: ₱${total.toFixed(2)}</div>
        <button class="btn btn-primary btn-sm" onclick="checkoutCart()">✅ Checkout Cart</button>
      </div>`;
  },

  payments() {
    const pays = DB.get('payments');
    const myPays =
      currentUser.role === 'customer' ? pays.filter(p => p.customerId === currentUser.id) :
      currentUser.role === 'vendor'   ? pays.filter(p => p.vendorId === currentUser.id || (p.vendorIds || []).includes(currentUser.id)) :
      pays;

    document.getElementById('payments-table').innerHTML = myPays.length
      ? myPays.map(p => `
          <tr>
            <td><b>${p.id}</b></td>
            <td>${p.orderId}</td>
            <td>${p.customerName}</td>
            <td>₱${p.amount.toFixed(2)}</td>
            <td><span class="badge badge-blue">${p.method}</span></td>
            <td><span class="badge ${p.status === 'Paid' ? 'badge-green' : p.status === 'Pending' ? 'badge-orange' : 'badge-red'}">${p.status}</span></td>
            <td>${p.date}</td>
          </tr>`).join('')
      : `<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">💳</div>No payment records.</div></td></tr>`;
  },

  delivery() {
    const deliveries = DB.get('deliveries');
    const riders = DB.get('users').filter(u => u.role === 'rider');
    const myDel =
      currentUser.role === 'customer' ? deliveries.filter(d => d.customerId === currentUser.id) :
      currentUser.role === 'rider'    ? deliveries.filter(d => d.riderId === currentUser.id) :
      currentUser.role === 'vendor'   ? deliveries.filter(d => deliveryHasVendor(d, currentUser.id)) :
      deliveries;

    document.getElementById('delivery-table').innerHTML = myDel.length
      ? myDel.map(d => {
          if (currentUser.role === 'rider') {
            return `
              <tr>
                <td><b>${d.id}</b></td>
                <td>${d.orderId}</td>
                <td>${d.customerName}</td>
                <td>${d.address}</td>
                <td>${d.company || '—'}</td>
                <td>${d.riderName || currentUser.name}</td>
                <td><span class="badge ${delivBadge(d.status)}">${d.status}</span></td>
                <td>
                  <div class="actions-row" style="display:flex;flex-wrap:wrap;gap:6px;">
                    ${d.status === 'Assigned' ? `<button class="btn btn-primary btn-sm" onclick="updateDelivery('${d.id}','Out for Delivery')">🚴 Pick Up</button>` : ''}
                    ${d.status === 'Out for Delivery' ? `<button class="btn btn-primary btn-sm" onclick="updateDelivery('${d.id}','Delivered')">✅ Confirm Delivery</button>` : ''}
                  </div>
                </td>
              </tr>`;
          }

          return `
            <tr>
              <td><b>${d.id}</b></td>
              <td>${d.orderId}</td>
              <td>${d.customerName}</td>
              <td>${d.address}</td>
              <td>${d.company || '—'}</td>
              <td>${d.riderName ||
                `<select onchange="assignRider('${d.id}',this.value)" style="font-size:12px;padding:4px 8px">
                  <option value="">Choose Rider</option>
                  ${riders.filter(r => r.company === d.company).map(r => `<option value="${r.id}">${r.name}</option>`).join('')}
                </select>`}
              </td>
              <td><span class="badge ${delivBadge(d.status)}">${d.status}</span></td>
              <td>
                <div class="actions-row" style="display:flex;flex-wrap:wrap;gap:6px;">
                  <button class="btn btn-outline btn-sm" onclick="viewTracking('${d.id}')">📍 Track</button>
                  ${currentUser.role === 'admin' || (currentUser.role === 'vendor' && d.vendorId === currentUser.id)
                    ? d.status === 'Assigned'
                      ? `<button class="btn btn-primary btn-sm" onclick="updateDelivery('${d.id}','Out for Delivery')">🚴 Pick Up</button>`
                      : d.status === 'Out for Delivery'
                      ? `<button class="btn btn-primary btn-sm" onclick="updateDelivery('${d.id}','Delivered')">✅ Delivered</button>` : ''
                    : ''}
                </div>
              </td>
            </tr>`;
        }).join('')
      : `<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">🚚</div>No deliveries found.</div></td></tr>`;
  },

  users() {
    const users = DB.get('users');
    document.getElementById('users-table').innerHTML = users.map(u => `
      <tr>
        <td><b>${u.id}</b></td>
        <td>${u.name}</td>
        <td>${u.email}</td>
        <td><span class="role-pill role-${u.role === 'vendor' ? 'vendor' : u.role === 'rider' ? 'rider' : 'customer'}">${u.role}</span></td>
        <td>${u.joined}</td>
        <td>${u.id !== currentUser.id && u.role !== 'admin'
              ? `<button class="btn btn-danger btn-sm" onclick="deleteUser('${u.id}')">🗑 Remove</button>`
              : '—'}</td>
      </tr>`).join('');
  }
};

// ═══════════════════════════════════════════
//  MODAL HELPERS
// ═══════════════════════════════════════════

function openModal(id)  { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

document.querySelectorAll('.modal-overlay').forEach(el => {
  el.addEventListener('click', e => { if (e.target === el) el.classList.remove('open'); });
});

// ═══════════════════════════════════════════
//  PRODUCTS
// ═══════════════════════════════════════════

function saveProduct() {
  const id       = document.getElementById('product-edit-id').value;
  const name     = document.getElementById('prod-name').value.trim();
  const cat      = document.getElementById('prod-cat').value;
  const price    = parseFloat(document.getElementById('prod-price').value);
  const stock    = parseInt(document.getElementById('prod-stock').value);
  const desc     = document.getElementById('prod-desc').value.trim();
  const stockUnit = document.getElementById('prod-stock-unit').value;
  const priceUnit = document.getElementById('prod-price-unit').value;

  if (!name || isNaN(price) || isNaN(stock)) return alert('Please fill in all required fields.');

  const prods = DB.get('products');
  if (id) {
    const idx = prods.findIndex(p => p.id === id);
    if (idx > -1) prods[idx] = { ...prods[idx], name, category: cat, price, stock, desc, stockUnit, priceUnit };
  } else {
    prods.push({
      id: DB.nextId('products'), name, category: cat, price, stock, desc, stockUnit, priceUnit,
      vendorId: currentUser.id, vendorName: currentUser.name, date: now()
    });
  }
  DB.set('products', prods);
  closeModal('modal-product');
  clearProductForm();
  renders.products();
}

function editProduct(id) {
  const p = DB.get('products').find(x => x.id === id);
  document.getElementById('product-edit-id').value = p.id;
  document.getElementById('prod-name').value        = p.name;
  document.getElementById('prod-cat').value         = p.category;
  document.getElementById('prod-price').value       = p.price;
  document.getElementById('prod-stock').value       = p.stock;
  document.getElementById('prod-stock-unit').value  = p.stockUnit || 'unit';
  document.getElementById('prod-price-unit').value  = p.priceUnit || 'per unit';
  document.getElementById('prod-desc').value        = p.desc || '';
  openModal('modal-product');
}

function deleteProduct(id) {
  const prod = DB.get('products').find(p => p.id === id);
  if (!prod) return alert('Product not found.');
  if (!currentUser || (currentUser.role !== 'admin' && !(currentUser.role === 'vendor' && currentUser.id === prod.vendorId))) {
    return alert('Only the product vendor or admin can delete this product.');
  }
  if (!confirm('Delete this product?')) return;
  DB.set('products', DB.get('products').filter(p => p.id !== id));
  renders.products();
}

function clearProductForm() {
  ['product-edit-id', 'prod-name', 'prod-price', 'prod-stock', 'prod-desc']
    .forEach(id => document.getElementById(id).value = '');
  document.getElementById('prod-stock-unit').value = 'unit';
  document.getElementById('prod-price-unit').value = 'per unit';
}

// ═══════════════════════════════════════════
//  ORDERS & CART
// ═══════════════════════════════════════════

function cartKey() {
  return 'cart_' + currentUser.id;
}

function getCart() {
  return DB.get(cartKey()) || [];
}

function saveCart(cart) {
  DB.set(cartKey(), cart);
}

function renderCart() {
  const cartCard = document.getElementById('cart-card');
  if (!cartCard) return;
  if (!currentUser || currentUser.role !== 'customer') {
    cartCard.style.display = 'none';
    return;
  }

  const cart = getCart();
  cartCard.style.display = cart.length ? 'block' : 'block';
  document.getElementById('cart-items').innerHTML = cart.length
    ? cart.map(item => `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 0;border-bottom:1px solid var(--g100)">
          <div>
            <div style="font-weight:700">${item.name}</div>
            <div style="font-size:12px;color:var(--muted)">${item.qty} × ₱${item.price.toFixed(2)} — ${item.vendorName}</div>
          </div>
          <div style="display:flex;gap:8px;align-items:center">
            <button class="btn btn-outline btn-sm" onclick="removeCartItem('${item.id}')">✖ Remove</button>
          </div>
        </div>`).join('')
    : `<div class="empty-state"><div class="empty-icon">🛒</div>Your cart is empty. Add products from the listing.</div>`;

  const total = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  document.getElementById('cart-summary-text').textContent = cart.length
    ? `${cart.length} item(s) • ₱${total.toFixed(2)}`
    : '';
}

function selectCategory(cat) {
  selectedCategory = selectedCategory === cat ? null : cat;
  document.querySelectorAll('.category-card').forEach(el => el.classList.toggle('selected', el.textContent.trim().startsWith(cat.split(' ')[0]) || el.textContent.trim().startsWith((selectedCategory||'').split(' ')[0])));
  renders.products();
}

function openDirectOrder(productId) {
  const prod = DB.get('products').find(p => p.id === productId);
  if (!prod) return alert('Product not found.');

  const stockUnit = prod.stockUnit || 'unit';
  const riders = DB.get('users').filter(u => u.role === 'rider');
  const companies = [...new Set(riders.map(r => r.company).filter(Boolean))];

  const companySelect = document.getElementById('direct-order-company');
  companySelect.innerHTML = deliveryOptionsHtml(companies);

  document.getElementById('direct-order-prod-id').value = prod.id;
  document.getElementById('direct-order-prod-name').value = prod.name;
  document.getElementById('direct-order-qty').value = 1;
  document.getElementById('direct-order-unit-label').textContent = `(${stockUnit})`;
  updateDirectOrderTotal();
  document.getElementById('direct-order-address').value = '';
  document.getElementById('direct-order-address').disabled = false;
  document.getElementById('direct-order-address').placeholder = 'Enter delivery address';
  setPaymentOptions('direct-order-payment', false);
  document.getElementById('direct-order-company').value = '';
  document.getElementById('direct-order-rider').value = '';
  document.getElementById('direct-order-rider').innerHTML = `<option value="">Any Rider from Company</option>`;
  document.getElementById('direct-order-rider').disabled = false;
  openModal('modal-direct-order');
}

function updateDirectOrderTotal() {
  const prodId = document.getElementById('direct-order-prod-id').value;
  const qty = parseInt(document.getElementById('direct-order-qty').value) || 1;
  const prod = DB.get('products').find(p => p.id === prodId);
  const totalEl = document.getElementById('direct-order-total');
  if (!prod || !totalEl) return;

  const subtotal = prod.price * qty;
  const total = subtotal + HANDLING_FEE;
  totalEl.innerHTML = `
    <div>₱${total.toFixed(2)}</div>
    <div style="font-size:11px;color:var(--muted);font-weight:500;margin-top:3px">
      Items: ₱${subtotal.toFixed(2)} + Handling fee: ₱${HANDLING_FEE.toFixed(2)}
    </div>`;
}

function updateDirectOrderRiders() {
  const company = document.getElementById('direct-order-company').value;
  const riderSelect = document.getElementById('direct-order-rider');
  setPickupFormState('direct-order-address', 'direct-order-rider', company);
  setPaymentOptions('direct-order-payment', isPickupOption(company));
  if (isPickupOption(company)) {
    return;
  }

  const riders = DB.get('users').filter(u => u.role === 'rider' && u.company === company);
  riderSelect.innerHTML = `<option value="">Any Rider from Company</option>${riders.map(r => `<option value="${r.id}">${r.name}</option>`).join('')}`;
  riderSelect.value = '';
  riderSelect.disabled = false;
}

function handlePaymentChange(selectId) {
  const method = document.getElementById(selectId).value;
  const infoId = selectId === 'direct-order-payment' ? 'direct-order-gcash-info' : 'cart-checkout-gcash-info';
  const infoEl = document.getElementById(infoId);
  if (infoEl) {
    infoEl.style.display = method === 'GCash' ? 'block' : 'none';
  }
}

function submitDirectOrder() {
  const prodId    = document.getElementById('direct-order-prod-id').value;
  const qty       = parseInt(document.getElementById('direct-order-qty').value);
  const addressInput = document.getElementById('direct-order-address').value.trim();
  const payMethod = document.getElementById('direct-order-payment').value;
  const company   = document.getElementById('direct-order-company').value;
  const isPickup = isPickupOption(company);
  const riderId   = isPickup ? null : document.getElementById('direct-order-rider').value || null;
  const address = isPickup ? 'Store pickup' : addressInput;

  if (!prodId || !qty || (!isPickup && !address)) return alert('Please fill in all order fields.');
  if (!company) return alert('Please select a delivery option.');

  const prod = DB.get('products').find(p => p.id === prodId);
  if (!prod) return alert('Product not found.');
  if (prod.stock < qty) return alert(`Only ${prod.stock} in stock.`);

  const rider = riderId ? DB.get('users').find(u => u.id === riderId) : null;
  const orderId = createOrder(prod, qty, address, payMethod, riderId || null, rider ? rider.name : null, company);
  closeModal('modal-direct-order');
  alert(`✅ Order ${orderId} placed successfully!`);
  renders.orders();
  renders.products();
}

function openAddToCart(productId) {
  const prod = DB.get('products').find(p => p.id === productId);
  if (!prod) return alert('Product not found.');
  const stockUnit = prod.stockUnit || 'unit';
  const priceUnit = prod.priceUnit || 'per unit';

  document.getElementById('add-cart-prod-id').value = prod.id;
  document.getElementById('add-cart-prod-name').value = prod.name;
  document.getElementById('add-cart-qty').value = 1;
  document.getElementById('add-cart-unit-label').textContent = `(${stockUnit})`;
  document.getElementById('add-cart-total').textContent = `₱${prod.price.toFixed(2)} ${priceUnit}`;
  openModal('modal-add-cart');
}

function updateAddCartTotal() {
  const prodId = document.getElementById('add-cart-prod-id').value;
  const qty = parseInt(document.getElementById('add-cart-qty').value) || 1;
  const prod = DB.get('products').find(p => p.id === prodId);
  if (!prod) return;
  const priceUnit = prod.priceUnit || 'per unit';
  document.getElementById('add-cart-total').textContent = `₱${(prod.price * qty).toFixed(2)} (${qty} × ₱${prod.price.toFixed(2)} ${priceUnit})`;
}

function submitAddToCart() {
  const prodId = document.getElementById('add-cart-prod-id').value;
  const qty = parseInt(document.getElementById('add-cart-qty').value);
  if (!prodId || !qty || qty < 1) return alert('Enter a valid quantity.');

  const prod = DB.get('products').find(p => p.id === prodId);
  if (!prod) return alert('Product not found.');
  if (prod.stock < qty) return alert(`Only ${prod.stock} available.`);

  const cart = getCart();
  const existing = cart.find(item => item.id === prodId);
  if (existing) {
    existing.qty = Math.min(existing.qty + qty, prod.stock);
  } else {
    cart.push({
      id: prod.id, name: prod.name, price: prod.price, qty,
      stockUnit: prod.stockUnit || 'unit', priceUnit: prod.priceUnit || 'per unit',
      vendorId: prod.vendorId, vendorName: prod.vendorName
    });
  }
  saveCart(cart);
  closeModal('modal-add-cart');
  if (document.getElementById('page-cart').classList.contains('active')) renders.cart();
  alert(`✅ Added ${qty} ${prod.stockUnit || 'unit'}${qty > 1 ? 's' : ''} of ${prod.name} to cart.`);
}

function removeCartItem(productId) {
  const cart = getCart().filter(item => item.id !== productId);
  saveCart(cart);
  if (document.getElementById('page-cart').classList.contains('active')) renders.cart();
}

function updateCartQty(productId, qty) {
  const cart = getCart();
  const item = cart.find(i => i.id === productId);
  if (!item) return;
  if (qty < 1) return removeCartItem(productId);

  const prod = DB.get('products').find(p => p.id === productId);
  if (!prod) return alert('Product not found.');
  if (qty > prod.stock) return alert(`Only ${prod.stock} available.`);

  item.qty = qty;
  saveCart(cart);
  renders.cart();
}

function checkoutCart() {
  const cart = getCart();
  if (!cart.length) return alert('Your cart is empty.');

  const subtotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const total = subtotal + HANDLING_FEE;
  document.getElementById('cart-checkout-content').innerHTML = `
    <div style="margin-bottom:16px;font-size:14px;font-weight:700;">${cart.length} item(s) • ₱${total.toFixed(2)}</div>
    <div style="font-size:12px;color:var(--muted);margin-bottom:12px">Includes one ₱${HANDLING_FEE.toFixed(2)} handling fee for this checkout.</div>
    ${cart.map(item => `<div style="font-size:13px;margin-bottom:8px">${item.qty} ${item.stockUnit || 'unit'} of ${item.name} — ₱${(item.price * item.qty).toFixed(2)}</div>`).join('')}`;
  document.getElementById('cart-checkout-address').value = '';
  document.getElementById('cart-checkout-address').disabled = false;
  document.getElementById('cart-checkout-address').placeholder = 'Enter delivery address';
  setPaymentOptions('cart-checkout-payment', false);

  const riders = DB.get('users').filter(u => u.role === 'rider');
  const companies = [...new Set(riders.map(r => r.company).filter(Boolean))];

  const companySelect = document.getElementById('cart-checkout-company');
  if (companySelect) {
    companySelect.innerHTML = deliveryOptionsHtml(companies);
    companySelect.value = '';
  }

  const riderSelect = document.getElementById('cart-checkout-rider');
  if (riderSelect) {
    riderSelect.innerHTML = `<option value="">Any Rider from Company</option>`;
    riderSelect.value = '';
    riderSelect.disabled = false;
  }

  openModal('modal-checkout-cart');
}

function updateCartCheckoutRiders() {
  const company = document.getElementById('cart-checkout-company').value;
  const riderSelect = document.getElementById('cart-checkout-rider');
  setPickupFormState('cart-checkout-address', 'cart-checkout-rider', company);
  setPaymentOptions('cart-checkout-payment', isPickupOption(company));
  if (isPickupOption(company)) {
    return;
  }

  const riders = DB.get('users').filter(u => u.role === 'rider' && u.company === company);
  riderSelect.innerHTML = `<option value="">Any Rider from Company</option>${riders.map(r => `<option value="${r.id}">${r.name}</option>`).join('')}`;
  riderSelect.value = '';
  riderSelect.disabled = false;
}

function submitCartCheckout() {
  const addressInput = document.getElementById('cart-checkout-address').value.trim();
  const payMethod = document.getElementById('cart-checkout-payment').value;
  const company = document.getElementById('cart-checkout-company').value;
  const isPickup = isPickupOption(company);
  const address = isPickup ? 'Store pickup' : addressInput;
  const cart = getCart();

  if (!isPickup && !address) return alert('Please enter delivery address.');
  if (!company) return alert('Please select a delivery option.');
  if (!cart.length) return alert('Your cart is empty.');

  const prods = DB.get('products');
  for (const item of cart) {
    const prod = prods.find(p => p.id === item.id);
    if (!prod) return alert(`Product ${item.name} not found.`);
    if (prod.stock < item.qty) return alert(`Not enough stock for ${item.name}.`);
  }

  const riderId = isPickup ? '' : (document.getElementById('cart-checkout-rider') || {}).value || '';
  const rider = riderId ? DB.get('users').find(u => u.id === riderId) : null;
  const orderId = createCheckoutOrder(cart, address, payMethod, riderId || null, rider ? rider.name : null, company);

  saveCart([]);
  closeModal('modal-checkout-cart');
  renderCart();
  renders.orders();
  renders.products();
  alert(`✅ Order ${orderId} created from cart.`);
}

function createOrder(prod, qty, address, payMethod, riderId = null, riderName = null, company = null, checkoutId = null, handlingFee = HANDLING_FEE) {
  const orderId = DB.nextId('orders');
  const orderCheckoutId = checkoutId || orderId;
  const isPickup = isPickupOption(company);
  const subtotal = prod.price * qty;
  const total = subtotal + handlingFee;

  const orders = DB.get('orders');
  orders.push({
    id: orderId, checkoutId: orderCheckoutId, productId: prod.id, productName: prod.name, qty, qtyUnit: prod.stockUnit || 'unit', total,
    subtotal, handlingFee,
    customerId: currentUser.id, customerName: currentUser.name,
    vendorId: prod.vendorId, vendorName: prod.vendorName,
    fulfillmentOption: isPickup ? 'Pickup' : 'Delivery',
    deliveryOption: isPickup ? 'Pickup' : company,
    payMethod, payStatus: 'Pending',
    address, status: 'Pending', date: now()
  });
  DB.set('orders', orders);

  prod.stock -= qty;
  const prods = DB.get('products');
  const idx = prods.findIndex(p => p.id === prod.id);
  if (idx > -1) prods[idx] = prod;
  DB.set('products', prods);

  const pays = DB.get('payments');
  pays.push({
    id: DB.nextId('payments'), orderId, checkoutId: orderCheckoutId, amount: total, method: payMethod,
    status: 'Pending',
    customerId: currentUser.id, customerName: currentUser.name,
    vendorId: prod.vendorId, vendorName: prod.vendorName, date: now()
  });
  DB.set('payments', pays);

  if (!isPickup) {
    const deliveries = DB.get('deliveries');
    deliveries.push({
      id: DB.nextId('deliveries'), orderId, checkoutId: orderCheckoutId, address,
      customerId: currentUser.id, customerName: currentUser.name, customerEmail: currentUser.email,
      vendorId: prod.vendorId, vendorName: prod.vendorName,
      productName: prod.name, qty, qtyUnit: prod.stockUnit || 'unit', riderId: riderId || null, riderName: riderName || null,
      company: company || null,
      status: riderId ? 'Assigned' : 'Pending',
      timeline: [
        { label: 'Awaiting Pickup',   time: riderId ? now() : null },
        { label: 'Out for Delivery',  time: null },
        { label: 'Delivered',         time: null }
      ]
    });
    DB.set('deliveries', deliveries);
  }

  return orderId;
}

function createCheckoutOrder(cart, address, payMethod, riderId = null, riderName = null, company = null) {
  const orderId = DB.nextId('orders');
  const isPickup = isPickupOption(company);
  const prods = DB.get('products');
  const items = cart.map(item => {
    const prod = prods.find(p => p.id === item.id);
    return {
      productId: prod.id,
      productName: prod.name,
      id: orderId,
      orderId,
      qty: item.qty,
      qtyUnit: prod.stockUnit || item.stockUnit || 'unit',
      subtotal: prod.price * item.qty,
      vendorId: prod.vendorId,
      vendorName: prod.vendorName
    };
  });
  const vendorIds = [...new Set(items.map(item => item.vendorId))];
  const vendorNames = [...new Set(items.map(item => item.vendorName))];
  const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
  const total = subtotal + HANDLING_FEE;
  const productName = items.length === 1 ? items[0].productName : `${items.length} items`;
  const totalQty = items.reduce((sum, item) => sum + item.qty, 0);

  const orders = DB.get('orders');
  orders.push({
    id: orderId,
    checkoutId: orderId,
    productId: items.length === 1 ? items[0].productId : null,
    productName,
    qty: totalQty,
    qtyUnit: items.length === 1 ? items[0].qtyUnit : 'items',
    total,
    subtotal,
    handlingFee: HANDLING_FEE,
    items,
    customerId: currentUser.id,
    customerName: currentUser.name,
    vendorId: vendorIds[0],
    vendorIds,
    vendorName: vendorNames.length === 1 ? vendorNames[0] : 'Multiple Vendors',
    vendorNames,
    fulfillmentOption: isPickup ? 'Pickup' : 'Delivery',
    deliveryOption: isPickup ? 'Pickup' : company,
    payMethod,
    payStatus: 'Pending',
    address,
    status: 'Pending',
    date: now()
  });
  DB.set('orders', orders);

  items.forEach(item => {
    const prod = prods.find(p => p.id === item.productId);
    if (prod) prod.stock -= item.qty;
  });
  DB.set('products', prods);

  const pays = DB.get('payments');
  pays.push({
    id: DB.nextId('payments'), orderId, checkoutId: orderId, amount: total, method: payMethod,
    status: 'Pending',
    customerId: currentUser.id, customerName: currentUser.name,
    vendorId: vendorIds[0], vendorIds, vendorName: vendorNames.length === 1 ? vendorNames[0] : 'Multiple Vendors',
    date: now()
  });
  DB.set('payments', pays);

  if (!isPickup) {
    const deliveries = DB.get('deliveries');
    deliveries.push({
      id: DB.nextId('deliveries'), orderId, checkoutId: orderId, address,
      customerId: currentUser.id, customerName: currentUser.name, customerEmail: currentUser.email,
      vendorId: vendorIds[0], vendorIds, vendorName: vendorNames.length === 1 ? vendorNames[0] : 'Multiple Vendors',
      productName, qty: totalQty, qtyUnit: items.length === 1 ? items[0].qtyUnit : 'items', items,
      riderId: riderId || null, riderName: riderName || null,
      company: company || null,
      status: riderId ? 'Assigned' : 'Pending',
      timeline: [
        { label: 'Awaiting Pickup',   time: riderId ? now() : null },
        { label: 'Out for Delivery',  time: null },
        { label: 'Delivered',         time: null }
      ]
    });
    DB.set('deliveries', deliveries);
  }

  return orderId;
}

function updateOrderStatus(id, status) {
  const orders = DB.get('orders');
  const ord    = orders.find(o => o.id === id);
  if (ord) {
    ord.status = status;
    // ✅ NEVER touch payStatus here — only vendor confirmation changes it
    DB.set('orders', orders);
  }

  if (status === 'Delivered') {
    const dels = DB.get('deliveries');
    const del  = dels.find(d => d.orderId === id);
    if (del) {
      del.status = 'Delivered';
      updateTimeline(del, 'Delivered');
      DB.set('deliveries', dels);
    }
    // ✅ Do NOT mark payment as Paid here — vendor must confirm
  }

  if (status === 'Shipped') {
    const dels = DB.get('deliveries');
    const del  = dels.find(d => d.orderId === id);
    if (del) {
      del.status = 'Assigned';
      updateTimeline(del, 'Awaiting Pickup');
      DB.set('deliveries', dels);
    }

    // ── Mark payment as Paid when vendor ships ──
    if (ord) {
      ord.payStatus = 'Paid';
      DB.set('orders', orders);
    }
    const pays = DB.get('payments');
    const pay  = pays.find(p => p.orderId === id);
    if (pay) {
      pay.status = 'Paid';
      pay.paidAt = now();
      DB.set('payments', pays);
    }
  }

  renders.orders();
}

function cancelOrder(id) {
  if (!confirm('Cancel this order?')) return;
  const orders = DB.get('orders');
  const ord    = orders.find(o => o.id === id);
  if (ord) {
    ord.status = 'Cancelled';
    const prods = DB.get('products');
    const prod  = prods.find(p => p.id === ord.productId);
    if (prod) { prod.stock += ord.qty; DB.set('products', prods); }
    DB.set('orders', orders);
  }
  renders.orders();
}

function removeOrder(id) {
  if (!confirm('Remove this canceled order?')) return;
  DB.set('orders', DB.get('orders').filter(o => o.id !== id));
  renders.orders();
}

// ═══════════════════════════════════════════
//  VENDOR PAYMENT CONFIRMATION
//  The ONLY place that marks payment as Paid.
//  Updates order.payStatus, payment.status in one atomic write.
// ═══════════════════════════════════════════

function vendorConfirmPayment(orderId) {
  if (!confirm('Confirm you received payment for this order?')) return;
  if (!currentUser || currentUser.role !== 'vendor') return alert('Only vendors can confirm received payments.');

  const orders = DB.get('orders');
  const ord = orders.find(o => o.id === orderId);
  if (!ord) return alert('Order not found.');
  if (!orderHasVendor(ord, currentUser.id)) return alert('You are not the vendor for this order.');

  // ── 1. Mark order as Paid ──
  ord.payStatus = 'Paid';
  DB.set('orders', orders);

  // ── 2. Mark matching payment record as Paid ──
  const pays = DB.get('payments');
  const pay = pays.find(p => p.orderId === orderId);
  if (pay) {
    pay.status = 'Paid';
    pay.paidAt = now();
    DB.set('payments', pays);
  }

  renders.orders();
  alert('✅ Payment confirmed and all records updated to Paid.');
}

// Legacy stub — kept so any old references don't break, but does nothing
function confirmPayment(orderId) {
  alert('Only vendors can confirm received payments. Use the "💰 Confirm Received" button in your Orders tab.');
}

function viewOrderDetail(id) {
  const orders = DB.get('orders');
  const o = orders.find(x => x.id === id);
  if (!o) return alert('Order not found.');

  const checkoutId = o.checkoutId || o.id;
  const checkoutOrders = orders.filter(x => (x.checkoutId || x.id) === checkoutId);
  const deliveries = DB.get('deliveries');
  const delivery = deliveries.find(d => d.orderId === id);
  const checkoutDeliveries = deliveries.filter(d => (d.checkoutId || d.orderId) === checkoutId);
  const detailItems = o.items && o.items.length
    ? o.items
    : checkoutOrders.map(item => ({
        productName: item.productName,
        qty: item.qty,
        qtyUnit: item.qtyUnit || 'unit',
        subtotal: item.subtotal ?? (item.total - (item.handlingFee || 0)),
        orderId: item.id
      }));
  const itemSubtotal = detailItems.reduce((sum, item) => sum + item.subtotal, 0);
  const handlingFee = checkoutOrders.reduce((sum, item) => sum + (item.handlingFee || 0), 0);
  const checkoutTotal = itemSubtotal + handlingFee;

  document.getElementById('order-detail-content').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div><div style="font-size:11px;color:var(--muted);font-weight:700">CHECKOUT ID</div><div style="font-weight:700">${checkoutId}</div></div>
      <div><div style="font-size:11px;color:var(--muted);font-weight:700">DATE</div><div>${o.date}</div></div>
      <div style="grid-column:span 2">
        <div style="font-size:11px;color:var(--muted);font-weight:700;margin-bottom:6px">ITEMS</div>
        ${detailItems.map(item => `
          <div style="display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid var(--line)">
            <div>${item.productName}<div style="font-size:11px;color:var(--muted)">${item.qty} ${item.qtyUnit || 'unit'} • Order ${item.id}</div></div>
            <div style="font-weight:700">₱${(item.subtotal ?? (item.total - (item.handlingFee || 0))).toFixed(2)}</div>
          </div>
        `).join('')}
      </div>
      <div><div style="font-size:11px;color:var(--muted);font-weight:700">ITEM SUBTOTAL</div><div>₱${itemSubtotal.toFixed(2)}</div></div>
      <div><div style="font-size:11px;color:var(--muted);font-weight:700">HANDLING FEE</div><div>₱${handlingFee.toFixed(2)}</div></div>
      <div><div style="font-size:11px;color:var(--muted);font-weight:700">CHECKOUT TOTAL</div><div style="font-weight:700;color:var(--g700)">₱${checkoutTotal.toFixed(2)}</div></div>
      <div><div style="font-size:11px;color:var(--muted);font-weight:700">STATUS</div><div><span class="badge ${statusBadge(o.status)}">${o.status}</span></div></div>
      <div><div style="font-size:11px;color:var(--muted);font-weight:700">CUSTOMER</div><div>${o.customerName}</div></div>
      <div><div style="font-size:11px;color:var(--muted);font-weight:700">VENDOR</div><div>${o.vendorName}</div></div>
      <div><div style="font-size:11px;color:var(--muted);font-weight:700">DELIVERY OPTION</div><div>${o.fulfillmentOption || (o.deliveryOption === 'Pickup' ? 'Pickup' : 'Delivery')}</div></div>
      <div><div style="font-size:11px;color:var(--muted);font-weight:700">${(o.fulfillmentOption || '').toLowerCase() === 'pickup' ? 'PICKUP LOCATION' : 'DELIVERY ADDRESS'}</div><div>${o.address}</div></div>
      <div><div style="font-size:11px;color:var(--muted);font-weight:700">PAYMENT METHOD</div><div>${o.payMethod}</div></div>
      <div><div style="font-size:11px;color:var(--muted);font-weight:700">PAYMENT STATUS</div>
           <div><span class="badge ${o.payStatus === 'Paid' ? 'badge-green' : 'badge-orange'}">${o.payStatus}</span></div></div>
      ${delivery ? `
        <div style="grid-column:span 2">
          <div style="font-size:11px;color:var(--muted);font-weight:700;margin-bottom:6px">DELIVERIES</div>
          ${checkoutDeliveries.map(d => `
            <div style="display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid var(--line)">
              <div>${d.productName}<div style="font-size:11px;color:var(--muted)">Order ${d.orderId} • ${d.riderName || 'Not yet assigned'}</div></div>
              <div><span class="badge ${delivBadge(d.status)}">${d.status}</span></div>
            </div>
          `).join('')}
        </div>
      ` : ''}
    </div>`;
  openModal('modal-order-detail');
}

// ═══════════════════════════════════════════
//  DELIVERY
// ═══════════════════════════════════════════

function assignRider(delId, riderId) {
  if (!riderId) return;
  const dels  = DB.get('deliveries');
  const del   = dels.find(d => d.id === delId);
  const rider = DB.get('users').find(u => u.id === riderId);
  if (del && rider) {
    del.riderId   = riderId;
    del.riderName = rider.name;
    del.status    = 'Assigned';
    updateTimeline(del, 'Awaiting Pickup');
    DB.set('deliveries', dels);
  }
  if (renders.orders) renders.orders();
  renders.delivery();
}

function claimDelivery(delId) {
  if (!currentUser || currentUser.role !== 'rider') {
    return alert('Only riders can choose a delivery.');
  }

  const dels = DB.get('deliveries');
  const del = dels.find(d => d.id === delId);
  if (!del) return alert('Delivery not found.');
  if (del.riderId && del.riderId !== currentUser.id) {
    return alert('This delivery has already been chosen by another rider.');
  }

  const orders = DB.get('orders');
  const ord = orders.find(o => o.id === del.orderId);
  if (!ord || ord.status === 'Delivered' || ord.status === 'Cancelled') {
    return alert('This order is no longer available.');
  }

  del.riderId = currentUser.id;
  del.riderName = currentUser.name;
  del.status = 'Assigned';
  updateTimeline(del, 'Awaiting Pickup');
  DB.set('deliveries', dels);

  renders.orders();
  renders.delivery();
  if (renders.dashboard) renders.dashboard();
  alert(`Delivery ${del.id} is now assigned to you.`);
}

function updateDelivery(id, status) {
  const dels = DB.get('deliveries');
  const del  = dels.find(d => d.id === id);
  if (del) {
    if (currentUser && currentUser.role === 'rider' && del.riderId !== currentUser.id) {
      return alert('Choose this delivery first before updating it.');
    }

    del.status = status;
    updateTimeline(del, status);
    DB.set('deliveries', dels);

    if (status === 'Delivered') {
      // ── Update order status to Delivered ──
      const orders = DB.get('orders');
      const ord    = orders.find(o => o.id === del.orderId);
      if (ord) {
        ord.status = 'Delivered';
        // ✅ Do NOT touch ord.payStatus here — only vendor confirms payment
        DB.set('orders', orders);
      }
      // ✅ Do NOT auto-mark payment as Paid — vendor must confirm
    }
  }
  if (renders.orders) renders.orders();
  if (renders.dashboard) renders.dashboard();
  renders.delivery();
}

function updateTimeline(del, label) {
  const tl   = del.timeline || [];
  const item = tl.find(t => t.label === label);
  if (item && !item.time) item.time = now();
}

function viewTracking(id) {
  const del = DB.get('deliveries').find(d => d.id === id);
  const tl  = del.timeline || [];

  document.getElementById('tracking-content').innerHTML = `
    <div style="margin-bottom:16px">
      <div style="font-size:12px;color:var(--muted)">Delivery ID</div>
      <div style="font-weight:700">${del.id} → Order ${del.orderId}</div>
      <div style="font-size:12px;color:var(--muted);margin-top:8px">Status</div>
      <span class="badge ${delivBadge(del.status)}">${del.status}</span>
      <div style="font-size:12px;color:var(--muted);margin-top:8px">Rider</div>
      <div>${del.riderName || 'Not yet assigned'}</div>
      <div style="font-size:12px;color:var(--muted);margin-top:8px">Address</div>
      <div>${del.address}</div>
      ${currentUser && currentUser.role === 'rider' && del.riderId === currentUser.id && del.status === 'Assigned' ? `
        <div style="margin-top:16px">
          <button class="btn btn-primary btn-sm" onclick="updateDelivery('${del.id}','Out for Delivery'); closeModal('modal-tracking')">🚴 Pick Up</button>
        </div>` : ''}
      ${currentUser && currentUser.role === 'rider' && del.riderId === currentUser.id && del.status === 'Out for Delivery' ? `
        <div style="margin-top:16px">
          <button class="btn btn-primary btn-sm" onclick="updateDelivery('${del.id}','Delivered'); closeModal('modal-tracking')">✅ Confirm Delivery</button>
        </div>` : ''}
    </div>
    <div style="font-weight:700;font-size:13px;margin-bottom:12px;color:var(--g800)">📍 Timeline</div>
    <div class="timeline">
      ${tl.map(t => `
        <div class="tl-item">
          <div class="tl-dot ${t.time ? 'done' : ''}"></div>
          <div class="tl-content">
            <div class="tl-label">
              ${t.time
                ? '<span style="color:var(--g600)">✓ </span>'
                : '<span style="color:var(--muted)">○ </span>'}${t.label}
            </div>
            <div class="tl-time">${t.time || 'Pending...'}</div>
          </div>
        </div>`).join('')}
    </div>`;
  openModal('modal-tracking');
}

// ═══════════════════════════════════════════
//  USERS
// ═══════════════════════════════════════════

function deleteUser(id) {
  if (!confirm('Remove this user?')) return;
  DB.set('users', DB.get('users').filter(u => u.id !== id));
  renders.users();
}

// ═══════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════

function statusBadge(s) {
  return {
    Pending:    'badge-orange',
    Processing: 'badge-blue',
    Shipped:    'badge-blue',
    'Ready for pickup': 'badge-blue',
    Delivered:  'badge-green',
    Cancelled:  'badge-red'
  }[s] || 'badge-gray';
}

function delivBadge(s) {
  return {
    Pending:           'badge-gray',
    Assigned:          'badge-orange',
    'Out for Delivery':'badge-blue',
    Delivered:         'badge-green'
  }[s] || 'badge-gray';
}

// ═══════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════
DB.init();

// Restore session on page load
const savedUser = sessionStorage.getItem('currentUser');
if (savedUser) {
  try {
    currentUser = JSON.parse(savedUser);
    showApp(currentUser);
  } catch (e) {
    sessionStorage.removeItem('currentUser');
  }
}
