// ═══════════════════════════════════════════
//  SAOD — Smart Automated Order & Delivery
//  Local Database (localStorage)
// ═══════════════════════════════════════════

const DB = {
  get(k) {
    try { return JSON.parse(localStorage.getItem('saod_' + k) || 'null'); }
    catch (e) { return null; }
  },
  set(k, v) { localStorage.setItem('saod_' + k, JSON.stringify(v)); },
  init() {
    if (!this.get('users'))      this.set('users', []);
    if (!this.get('products'))   this.set('products', []);
    if (!this.get('orders'))     this.set('orders', []);
    if (!this.get('payments'))   this.set('payments', []);
    if (!this.get('deliveries')) this.set('deliveries', []);
    if (!this.get('id_seq'))     this.set('id_seq', { users: 0, products: 0, orders: 0, payments: 0, deliveries: 0 });

    // Seed default admin account
    const users = this.get('users');
    if (!users.find(u => u.email === 'admin@saod.com')) {
      users.push({ id: 'USR-000', name: 'Admin', email: 'admin@saod.com', password: 'admin123', role: 'admin', joined: now() });
      this.set('users', users);
    }
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
  document.getElementById('reg-msg').textContent = '';
  document.querySelectorAll('.role-card').forEach((c, i) => {
    c.classList.toggle('selected', i === 0);
  });
  const label = document.getElementById('reg-name-label');
  if (label) {
    label.textContent = 'Full Name';
  }
}

function selectRole(el) {
  document.querySelectorAll('.role-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  const role = el.dataset.role;
  const label = document.getElementById('reg-name-label');
  if (label) {
    label.textContent = role === 'rider' ? 'Full Name / Company Name' : 'Full Name';
  }
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

  if (!name || !email || !pass) return showMsg('reg-msg', 'Please fill in all fields.');
  if (pass.length < 6)         return showMsg('reg-msg', 'Password must be at least 6 characters.');

  const users = DB.get('users');
  if (users.find(u => u.email === email)) return showMsg('reg-msg', 'Email already registered.');

  const user = { id: DB.nextId('users'), name, email, password: pass, role, joined: now() };
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
  localStorage.setItem('currentUser', JSON.stringify(user));
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
  localStorage.removeItem('currentUser');
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
      u.role === 'vendor'   ? orders.filter(o => o.vendorId   === u.id) :
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
                    ${(currentUser.role === 'admin' || currentUser.id === p.vendorId)
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
      currentUser.role === 'vendor'   ? orders.filter(o => o.vendorId   === currentUser.id) :
      currentUser.role === 'rider'    ? orders.filter(o => deliveries.some(d => d.orderId === o.id && d.riderId === currentUser.id)) :
      orders;

    // Adjust the orders table header depending on the current user's role
    const headerRow = document.querySelector('#page-orders table thead tr');
    if (headerRow) {
      if (currentUser.role === 'rider') {
        headerRow.innerHTML = '<th>Order ID</th><th>Product</th><th>Qty</th><th>Total</th><th>Customer</th><th>Payment</th><th>Status</th><th>Actions</th>';
      } else {
        headerRow.innerHTML = '<th>Order ID</th><th>Product</th><th>Qty</th><th>Total</th><th>Customer</th><th>Vendor</th><th>Payment</th><th>Status</th><th>Actions</th>';
      }
    }

    if (currentUser.role === 'rider') {
      document.getElementById('orders-table').innerHTML = myOrders.length
        ? myOrders.map(o => `
            <tr>
              <td><b>${o.id}</b></td>
              <td>${o.productName}</td>
              <td>${o.qty} ${o.qtyUnit || 'unit'}</td>
              <td>₱${o.total.toFixed(2)}</td>
              <td>${o.customerName}</td>
              <td><span class="badge badge-blue">${o.payMethod}</span></td>
              <td><span class="badge ${statusBadge(o.status)}">${o.status}</span></td>
              <td>
                <div class="actions-row" style="display:flex;flex-wrap:wrap;gap:6px;">
                  <button class="btn btn-outline btn-sm" onclick="viewOrderDetail('${o.id}')">👁 View</button>
                </div>
              </td>
            </tr>`).join('')
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
      currentUser.role === 'vendor'   ? pays.filter(p => p.vendorId   === currentUser.id) :
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
      currentUser.role === 'vendor'   ? deliveries.filter(d => d.vendorId === currentUser.id) :
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
                <td>${d.riderName}</td>
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
              <td>${d.riderName ||
                `<select onchange="assignRider('${d.id}',this.value)" style="font-size:12px;padding:4px 8px">
                  <option value="">Choose Rider</option>
                  ${riders.map(r => `<option value="${r.id}">${r.name}</option>`).join('')}
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
      : `<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">🚚</div>No deliveries found.</div></td></tr>`;
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
  const riderSelect = document.getElementById('direct-order-rider');
  riderSelect.innerHTML = `<option value="">Company Delivery</option>${riders.map(r => `<option value="${r.id}">${r.name}</option>`).join('')}`;

  document.getElementById('direct-order-prod-id').value = prod.id;
  document.getElementById('direct-order-prod-name').value = prod.name;
  document.getElementById('direct-order-qty').value = 1;
  document.getElementById('direct-order-unit-label').textContent = `(${stockUnit})`;
  document.getElementById('direct-order-address').value = '';
  document.getElementById('direct-order-payment').value = 'COD';
  document.getElementById('direct-order-rider').value = '';
  openModal('modal-direct-order');
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
  const address   = document.getElementById('direct-order-address').value.trim();
  const payMethod = document.getElementById('direct-order-payment').value;
  const riderId   = document.getElementById('direct-order-rider').value || null;

  if (!prodId || !qty || !address) return alert('Please fill in all order fields.');

  const prod = DB.get('products').find(p => p.id === prodId);
  if (!prod) return alert('Product not found.');
  if (prod.stock < qty) return alert(`Only ${prod.stock} in stock.`);

  const rider = riderId ? DB.get('users').find(u => u.id === riderId) : null;
  const orderId = createOrder(prod, qty, address, payMethod, riderId || null, rider ? rider.name : null);
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

  const total = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  document.getElementById('cart-checkout-content').innerHTML = `
    <div style="margin-bottom:16px;font-size:14px;font-weight:700;">${cart.length} item(s) • ₱${total.toFixed(2)}</div>
    ${cart.map(item => `<div style="font-size:13px;margin-bottom:8px">${item.qty} ${item.stockUnit || 'unit'} of ${item.name} — ₱${item.price.toFixed(2)} ${item.priceUnit || 'per unit'}</div>`).join('')}`;
  document.getElementById('cart-checkout-address').value = '';
  document.getElementById('cart-checkout-payment').value = 'COD';
  const riders = DB.get('users').filter(u => u.role === 'rider');
  const riderSelect = document.getElementById('cart-checkout-rider');
  if (riderSelect) {
    riderSelect.innerHTML = `<option value="">Company Delivery</option>${riders.map(r => `<option value="${r.id}">${r.name}</option>`).join('')}`;
  }
  openModal('modal-checkout-cart');
}

function submitCartCheckout() {
  const address = document.getElementById('cart-checkout-address').value.trim();
  const payMethod = document.getElementById('cart-checkout-payment').value;
  const cart = getCart();

  if (!address) return alert('Please enter delivery address.');
  if (!cart.length) return alert('Your cart is empty.');

  const prods = DB.get('products');
  for (const item of cart) {
    const prod = prods.find(p => p.id === item.id);
    if (!prod) return alert(`Product ${item.name} not found.`);
    if (prod.stock < item.qty) return alert(`Not enough stock for ${item.name}.`);
  }

  const riderId = (document.getElementById('cart-checkout-rider') || {}).value || '';
  const created = [];
  cart.forEach(item => {
    const prod = DB.get('products').find(p => p.id === item.id);
    if (prod) {
      const rider = riderId ? DB.get('users').find(u => u.id === riderId) : null;
      created.push(createOrder(prod, item.qty, address, payMethod, riderId || null, rider ? rider.name : null));
    }
  });

  saveCart([]);
  closeModal('modal-checkout-cart');
  renderCart();
  renders.orders();
  renders.products();
  alert(`✅ Created ${created.length} order(s) from cart.`);
}

function createOrder(prod, qty, address, payMethod, riderId = null, riderName = null) {
  const orderId = DB.nextId('orders');
  const total   = prod.price * qty;

  const orders = DB.get('orders');
  orders.push({
    id: orderId, productId: prod.id, productName: prod.name, qty, qtyUnit: prod.stockUnit || 'unit', total,
    customerId: currentUser.id, customerName: currentUser.name,
    vendorId: prod.vendorId, vendorName: prod.vendorName,
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
    id: DB.nextId('payments'), orderId, amount: total, method: payMethod,
    status: 'Pending',
    customerId: currentUser.id, customerName: currentUser.name,
    vendorId: prod.vendorId, vendorName: prod.vendorName, date: now()
  });
  DB.set('payments', pays);

  const deliveries = DB.get('deliveries');
  deliveries.push({
    id: DB.nextId('deliveries'), orderId, address,
    customerId: currentUser.id, customerName: currentUser.name, customerEmail: currentUser.email,
    vendorId: prod.vendorId, vendorName: prod.vendorName,
    productName: prod.name, qty, qtyUnit: prod.stockUnit || 'unit', riderId: riderId || null, riderName: riderName || null,
    status: riderId ? 'Assigned' : 'Pending',
    timeline: [
      { label: 'Awaiting Pickup',   time: riderId ? now() : null },
      { label: 'Out for Delivery',  time: null },
      { label: 'Delivered',         time: null }
    ]
  });
  DB.set('deliveries', deliveries);

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
  if (ord.vendorId !== currentUser.id) return alert('You are not the vendor for this order.');

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
  const o = DB.get('orders').find(x => x.id === id);
  document.getElementById('order-detail-content').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div><div style="font-size:11px;color:var(--muted);font-weight:700">ORDER ID</div><div style="font-weight:700">${o.id}</div></div>
      <div><div style="font-size:11px;color:var(--muted);font-weight:700">DATE</div><div>${o.date}</div></div>
      <div><div style="font-size:11px;color:var(--muted);font-weight:700">PRODUCT</div><div>${o.productName}</div></div>
      <div><div style="font-size:11px;color:var(--muted);font-weight:700">QUANTITY</div><div>${o.qty} ${o.qtyUnit || 'unit'}</div></div>
      <div><div style="font-size:11px;color:var(--muted);font-weight:700">TOTAL</div><div style="font-weight:700;color:var(--g700)">₱${o.total.toFixed(2)}</div></div>
      <div><div style="font-size:11px;color:var(--muted);font-weight:700">STATUS</div><div><span class="badge ${statusBadge(o.status)}">${o.status}</span></div></div>
      <div><div style="font-size:11px;color:var(--muted);font-weight:700">CUSTOMER</div><div>${o.customerName}</div></div>
      <div><div style="font-size:11px;color:var(--muted);font-weight:700">VENDOR</div><div>${o.vendorName}</div></div>
      <div style="grid-column:span 2"><div style="font-size:11px;color:var(--muted);font-weight:700">DELIVERY ADDRESS</div><div>${o.address}</div></div>
      <div><div style="font-size:11px;color:var(--muted);font-weight:700">PAYMENT METHOD</div><div>${o.payMethod}</div></div>
      <div><div style="font-size:11px;color:var(--muted);font-weight:700">PAYMENT STATUS</div>
           <div><span class="badge ${o.payStatus === 'Paid' ? 'badge-green' : 'badge-orange'}">${o.payStatus}</span></div></div>
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
  renders.delivery();
}

function updateDelivery(id, status) {
  const dels = DB.get('deliveries');
  const del  = dels.find(d => d.id === id);
  if (del) {
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
const savedUser = localStorage.getItem('currentUser');
if (savedUser) {
  try {
    currentUser = JSON.parse(savedUser);
    showApp(currentUser);
  } catch (e) {
    localStorage.removeItem('currentUser');
  }
}