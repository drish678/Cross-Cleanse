// ── Global State ──
const profile = { skin_type: null, skin_types: [], concerns: [], budget: null, sensitivities: ['none'], experience: null, existing_actives: [] };
let cart = [];
let allProducts = [];
let activeFilters = { skin: [], type: [], price: [], concern: [], pref: [] };

const STEP_LABELS = { 1:'Step 1 · Cleanse', 2:'Step 2 · Tone & Exfoliate', 3:'Step 3 · Treat (Serum)', 4:'Step 4 · Eye Care', 5:'Step 5 · Moisturise', 6:'Step 6 · Sun Protection' };
const PRODUCT_ICONS = { Cleanser:'🧴', Toner:'💧', Serum:'⚗️', Moisturiser:'🌿', SPF:'☀️', 'Eye Care':'👁️', Oil:'✨', Mask:'🌸', Exfoliator:'🔬' };
const CONFLICT_ICONS = { high:'🚨', medium:'⚠️', low:'ℹ️' };
const STAR_LABELS = ['','Not confident at all','A little unsure','Getting there','Pretty confident','Very confident! 🎉'];

// ── Navigation ──
function showSection(name) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.getElementById('section-' + name).classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (name === 'catalog') renderCatalog();
  if (name === 'home') { renderFeatured(); setTimeout(animateCounters, 200); setTimeout(initHeroTypewriter, 400); }
  if (name === 'results') setTimeout(initTabIndicator, 100);
  setTimeout(refreshScrollReveal, 80);
  setTimeout(() => { initRipples(); initCardTilt(); initMagneticButtons(); initGlowRings(); }, 120);
}

// ── Quiz Progress ──
function updateProgress(step) {
  document.getElementById('progressFill').style.width = ((step - 1) / 6 * 100) + '%';
  document.getElementById('progressLabel').textContent = step + ' of 6';
}
function showStep(n) {
  document.querySelectorAll('.quiz-step').forEach(s => s.classList.remove('active'));
  document.getElementById('step-' + n).classList.add('active');
  updateProgress(n);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── Quiz Interactions ──
function selectOption(el) {
  const field = el.dataset.field;
  document.querySelectorAll(`[data-field="${field}"]`).forEach(b => b.classList.remove('selected'));
  el.classList.add('selected');
  profile[field] = el.dataset.value;
}

function toggleSkinType(el) {
  const value = el.dataset.value;
  if (el.classList.contains('selected')) {
    el.classList.remove('selected');
    profile.skin_types = profile.skin_types.filter(v => v !== value);
  } else {
    if (profile.skin_types.length >= 3) { showToast('Select up to 3 skin types'); return; }
    el.classList.add('selected');
    profile.skin_types.push(value);
  }
  // keep skin_type as primary (first selected) for backwards compat
  profile.skin_type = profile.skin_types[0] || null;
}

function toggleOption(el) {
  const field = el.dataset.field;
  const value = el.dataset.value;
  if (el.classList.contains('selected')) {
    el.classList.remove('selected');
    profile[field] = profile[field].filter(v => v !== value);
  } else {
    if (field === 'concerns' && profile[field].length >= 3) { showToast('Select up to 3 concerns'); return; }
    el.classList.add('selected');
    if (!Array.isArray(profile[field])) profile[field] = [];
    profile[field].push(value);
  }
}

function selectSensitivity(el) {
  document.querySelectorAll('[data-field="sensitivities"]').forEach(b => b.classList.remove('selected'));
  profile.sensitivities = [];
  el.classList.add('selected');
}

function nextStep(current) {
  const validators = {
    1: () => profile.skin_types.length > 0,
    2: () => profile.concerns.length > 0,
    3: () => profile.budget,
    5: () => profile.experience,
  };
  if (validators[current] && !validators[current]()) {
    const msgs = { 1:'Please select at least one skin type', 2:'Select at least one concern', 3:'Please select a budget', 5:'Please select your experience level' };
    showToast(msgs[current]); return;
  }
  showStep(current + 1);
}

// ── Submit Quiz ──
async function submitQuiz() {
  if (profile.existing_actives.length === 0) { showToast('Please select your current actives (or "None yet")'); return; }
  showLoading(true);
  const msgs = ['Analyzing your skin profile…','Matching products to your concerns…','Running ingredient conflict checks…','Sequencing your AM + PM routine…'];
  let i = 0;
  const iv = setInterval(() => { document.getElementById('loading-text').textContent = msgs[++i % msgs.length]; }, 1100);
  try {
    const res = await fetch('/api/routine', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(profile) });
    const data = await res.json();
    clearInterval(iv); showLoading(false);
    renderResults(data); showSection('results');
  } catch(e) { clearInterval(iv); showLoading(false); showToast('Something went wrong — please try again'); }
}

// ── Results ──
function renderResults(data) {
  const skinLabel = profile.skin_types.map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' + ');
  const concerns = profile.concerns.slice(0,2).join(', ');
  document.getElementById('results-sub').textContent = `${skinLabel} skin · ${concerns || 'general care'} · ${profile.budget} budget`;
  renderConflicts(data.conflicts || []);
  renderRoutineList('am-list', data.am || []);
  renderRoutineList('pm-list', data.pm || []);
  renderWeekly(data.weekly_mask);
  updateCartCtaBar();
}

function renderConflicts(conflicts) {
  const el = document.getElementById('conflicts-section');
  if (!conflicts.length) { el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  el.innerHTML = conflicts.map(c => `
    <div class="conflict-card ${c.severity}">
      <div class="conflict-icon">${CONFLICT_ICONS[c.severity]||'⚠️'}</div>
      <div class="conflict-body">
        <h4>${c.severity==='high'?'Conflict Detected':c.severity==='medium'?'Potential Conflict':'Note'}</h4>
        <p>${c.message}</p>
        <span class="conflict-tip">💡 ${c.tip}</span>
      </div>
    </div>`).join('');
}

function renderRoutineList(listId, products) {
  const el = document.getElementById(listId);
  if (!products.length) { el.innerHTML = '<div class="empty-state">No products for this slot.</div>'; return; }
  el.innerHTML = products.map((p, i) => {
    const price = `$${Number(p.price).toFixed(2)}`;
    const inC = cart.some(c => c.id === p.id);
    return `
    <div class="product-card" id="pcard-${p.id}">
      <div class="step-badge">${i+1}</div>
      <div class="product-info">
        <div class="product-step-label">${STEP_LABELS[p.step]||''}</div>
        <div class="product-name">${p.name}</div>
        <div class="product-brand">${p.brand}</div>
        <div class="product-why">${p.why||p.description}</div>
        <div class="product-tags">
          ${(p.key_ingredients||[]).slice(0,3).map(k=>`<span class="tag tag-ingredient">${k}</span>`).join('')}
          <span class="tag tag-price">${price}</span>
          ${p.fragrance_free?'<span class="tag tag-ingredient">Fragrance-free</span>':''}
        </div>
      </div>
      <div class="product-meta">
        <div class="product-price">${price}</div>
        <button class="add-to-cart-btn ${inC?'in-cart':''}" onclick="toggleCart(${p.id})" id="atc-${p.id}">
          ${inC?'✓ In Cart':'+ Add to Cart'}
        </button>
      </div>
    </div>`;
  }).join('');
}

function renderWeekly(mask) {
  const el = document.getElementById('weekly-list');
  if (!mask) { el.innerHTML = '<div class="empty-state">Add a weekly mask to your routine — browse the catalog for options.</div>'; return; }
  const price = `$${Number(mask.price).toFixed(2)}`;
  const inC = cart.some(c => c.id === mask.id);
  el.innerHTML = `
    <div class="product-card">
      <div class="step-badge">1×</div>
      <div class="product-info">
        <div class="product-step-label">Weekly Treatment · Mask</div>
        <div class="product-name">${mask.name}</div>
        <div class="product-brand">${mask.brand}</div>
        <div class="product-why">${mask.description}</div>
        <div class="product-tags">
          ${(mask.key_ingredients||[]).slice(0,3).map(k=>`<span class="tag tag-ingredient">${k}</span>`).join('')}
          <span class="tag tag-warn">1–2× per week</span>
        </div>
      </div>
      <div class="product-meta">
        <div class="product-price">${price}</div>
        <button class="add-to-cart-btn ${inC?'in-cart':''}" onclick="toggleCartMask(${mask.id})" id="atc-mask-${mask.id}">
          ${inC?'✓ In Cart':'+ Add to Cart'}
        </button>
      </div>
    </div>
    <div class="routine-intro" style="margin-top:12px">💡 Apply your weekly mask on a night when you're not using exfoliants or retinoids. Follow with your usual PM moisturiser.</div>`;
}

// ── Tabs ──
function showTab(name, btn) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.getElementById('tab-' + name).classList.add('active');
  btn.classList.add('active');
}

// ── Stars ──
function rateStar(n) {
  document.querySelectorAll('.star').forEach((s,i) => s.classList.toggle('lit', i < n));
  document.getElementById('star-label').textContent = STAR_LABELS[n]||'';
}

// ── Cart ──
function toggleCart(productId) {
  const p = allProducts.find(x => x.id === productId);
  if (!p) return;
  const idx = cart.findIndex(x => x.id === productId);
  if (idx >= 0) { cart.splice(idx, 1); } else { cart.push(p); }
  syncCartUI();
}
function toggleCartMask(id) { toggleCart(id); }

function syncCartUI() {
  // Count badge
  const count = cart.length;
  const badge = document.getElementById('cartCount');
  badge.textContent = count;
  badge.classList.toggle('hidden', count === 0);

  // Update all add-to-cart buttons
  allProducts.forEach(p => {
    const inC = cart.some(c => c.id === p.id);
    document.querySelectorAll(`[id^="atc-"][id$="-${p.id}"], #atc-${p.id}`).forEach(btn => {
      if (!btn) return;
      btn.textContent = inC ? '✓ In Cart' : '+ Add to Cart';
      btn.classList.toggle('in-cart', inC);
    });
    const catBtn = document.getElementById(`cat-atc-${p.id}`);
    if (catBtn) { catBtn.textContent = inC ? '✓ Added' : '+ Cart'; catBtn.classList.toggle('in-cart', inC); }
  });

  updateCartCtaBar();
  if (document.getElementById('cartSidebar').classList.contains('open')) renderCartSidebar();
}

function updateCartCtaBar() {
  const bar = document.getElementById('cartCtaBar');
  if (!bar) return;
  if (cart.length > 0) {
    bar.style.display = 'flex';
    document.getElementById('cartCtaText').textContent = `${cart.length} product${cart.length>1?'s':''} in cart — $${cartTotal().toFixed(2)}`;
  } else { bar.style.display = 'none'; }
}

function cartTotal() { return cart.reduce((s,p) => s + Number(p.price), 0); }

function openCart() {
  renderCartSidebar();
  document.getElementById('cartOverlay').classList.remove('hidden');
  document.getElementById('cartSidebar').classList.add('open');
}
function closeCart() {
  document.getElementById('cartOverlay').classList.add('hidden');
  document.getElementById('cartSidebar').classList.remove('open');
}

function renderCartSidebar() {
  const body = document.getElementById('cartSidebarBody');
  const footer = document.getElementById('cartSidebarFooter');
  if (cart.length === 0) {
    body.innerHTML = `<div class="cart-empty"><div class="cart-empty-icon">🛒</div><p>Your cart is empty.<br/>Take the quiz or browse products to add items.</p></div>`;
    footer.innerHTML = '';
    return;
  }
  body.innerHTML = cart.map(p => `
    <div class="cart-item">
      <div class="cart-item-icon">${PRODUCT_ICONS[p.type]||'✨'}</div>
      <div class="cart-item-body">
        <div class="cart-item-name">${p.name}</div>
        <div class="cart-item-brand">${p.brand}</div>
        <div class="cart-item-footer">
          <span class="cart-item-price">$${Number(p.price).toFixed(2)}</span>
          <button class="cart-remove" onclick="toggleCart(${p.id})">Remove</button>
        </div>
      </div>
    </div>`).join('');
  const total = cartTotal();
  footer.innerHTML = `
    <div class="cart-total-row"><span class="cart-total-label">Subtotal (${cart.length} item${cart.length>1?'s':''})</span><span class="cart-total-val">$${total.toFixed(2)}</span></div>
    <button class="cart-checkout-btn" onclick="goToCheckout()" ${cart.length===0?'disabled':''}>Proceed to Checkout →</button>
    <p style="font-size:.75rem;color:#9ca3af;text-align:center;margin-top:10px">Free shipping on all orders</p>`;
}

// ── Checkout ──
function goToCheckout() {
  closeCart();
  renderOrderSummary();
  showSection('checkout');
}

function closeCheckout() {
  openCart();
}

function renderOrderSummary() {
  const el = document.getElementById('orderSummary');
  const total = cartTotal();
  el.innerHTML = `
    <div class="order-summary-title">Order Summary</div>
    ${cart.map(p=>`
      <div class="order-item">
        <span class="order-item-name">${p.name}</span>
        <span class="order-item-price">$${Number(p.price).toFixed(2)}</span>
      </div>`).join('')}
    <div class="order-total-row">
      <span class="order-total-label">Total</span>
      <span class="order-total-price">$${total.toFixed(2)}</span>
    </div>
    <p style="font-size:.75rem;color:#9ca3af;margin-top:12px">✓ Free shipping · ✓ Returns accepted</p>`;
}

function placeOrder() {
  const email = document.getElementById('co-email').value.trim();
  const first = document.getElementById('co-first').value.trim();
  const last = document.getElementById('co-last').value.trim();
  const street = document.getElementById('co-street').value.trim();
  const card = document.getElementById('co-card').value.trim();
  if (!email || !first || !street || !card) { showToast('Please fill in all required fields'); return; }
  if (!email.includes('@')) { showToast('Please enter a valid email'); return; }

  const orderId = 'XC-' + Math.random().toString(36).slice(2,8).toUpperCase();
  const itemList = cart.map(p=>`• ${p.name} — $${Number(p.price).toFixed(2)}`).join('\n');
  document.getElementById('confirmation-detail').innerHTML = `
    <strong>Order #${orderId}</strong><br/>
    ${first} ${last} · ${email}<br/><br/>
    <strong>Items ordered:</strong><br/>
    ${cart.map(p=>`• ${p.name} — $${Number(p.price).toFixed(2)}`).join('<br/>')}
    <br/><br/>
    <strong>Total: $${cartTotal().toFixed(2)}</strong><br/>
    Estimated delivery: 5–7 business days`;

  cart = [];
  syncCartUI();
  showSection('confirmation');
}

// Card formatting helpers
function formatCard(el) {
  el.value = el.value.replace(/\D/g,'').replace(/(.{4})/g,'$1 ').trim().slice(0,19);
}
function formatExpiry(el) {
  let v = el.value.replace(/\D/g,'');
  if (v.length >= 2) v = v.slice(0,2) + ' / ' + v.slice(2,4);
  el.value = v;
}

// ── Catalog ──
async function loadProducts() {
  if (allProducts.length) return;
  const res = await fetch('/api/products');
  allProducts = await res.json();
}

async function renderCatalog() {
  await loadProducts();
  applyCatalogFilters();
  renderFeatured();
}

function applyCatalogFilters() {
  const sort = document.getElementById('sortSelect')?.value || 'default';
  let products = [...allProducts];

  if (activeFilters.skin.length) products = products.filter(p => activeFilters.skin.some(s => p.skin_types.includes(s) || p.skin_types.includes('all')));
  if (activeFilters.type.length) products = products.filter(p => activeFilters.type.includes(p.type));
  if (activeFilters.price.length) products = products.filter(p => activeFilters.price.includes(p.price_tier));
  if (activeFilters.concern.length) products = products.filter(p => activeFilters.concern.some(c => p.concerns.includes(c)));
  if (activeFilters.pref.includes('fragrance_free')) products = products.filter(p => p.fragrance_free);
  if (activeFilters.pref.includes('alcohol_free')) products = products.filter(p => p.alcohol_free);

  if (sort === 'price-asc') products.sort((a,b) => a.price - b.price);
  else if (sort === 'price-desc') products.sort((a,b) => b.price - a.price);
  else if (sort === 'name') products.sort((a,b) => a.name.localeCompare(b.name));

  const grid = document.getElementById('catalog-grid');
  const count = document.getElementById('resultsCount');
  if (!grid) return;
  count.textContent = `${products.length} product${products.length!==1?'s':''}`;
  grid.innerHTML = products.length === 0 ? '<div class="empty-state" style="grid-column:1/-1">No products match your filters. <button class="btn-link" onclick="clearFilters()">Clear filters</button></div>'
    : products.map(p => {
      const inC = cart.some(c => c.id === p.id);
      return `
      <div class="catalog-card">
        <div class="catalog-card-img">${PRODUCT_ICONS[p.type]||'✨'}</div>
        <div class="catalog-card-body">
          <div class="catalog-card-type">${p.type}</div>
          <div class="catalog-card-name">${p.name}</div>
          <div class="catalog-card-brand">${p.brand}</div>
            ${p.review_count > 0 ? `<div class="catalog-card-reviews">⭐ ${p.review_count.toLocaleString()} review${p.review_count!==1?'s':''}</div>` : ''}
          <div class="catalog-card-footer">
            <span class="catalog-card-price">$${Number(p.price).toFixed(2)}</span>
            <button class="catalog-add-btn ${inC?'in-cart':''}" id="cat-atc-${p.id}" onclick="toggleCart(${p.id})">
              ${inC?'✓ Added':'+ Cart'}
            </button>
          </div>
        </div>
      </div>`;
    }).join('');

  // Stagger cards in after render
  setTimeout(() => {
    document.querySelectorAll('.catalog-card').forEach((card, i) => {
      card.style.opacity = '0';
      card.style.transform = 'translateY(10px)';
      setTimeout(() => {
        card.style.transition = 'opacity .3s ease, transform .3s ease';
        card.style.opacity = '1';
        card.style.transform = '';
      }, i * 20);
    });
  }, 20);
}

function toggleFilter(el) {
  const type = el.dataset.filter;
  const val = el.dataset.value;
  el.classList.toggle('active');
  if (el.classList.contains('active')) { activeFilters[type].push(val); }
  else { activeFilters[type] = activeFilters[type].filter(v => v !== val); }
  applyCatalogFilters();
}

function clearFilters() {
  activeFilters = { skin:[], type:[], price:[], concern:[], pref:[] };
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  applyCatalogFilters();
}

// ── Featured (home page) ──
async function renderFeatured() {
  await loadProducts();
  const picks = allProducts.filter((_, i) => [0,10,13,20,30,16,35,45].includes(i)).slice(0,8);
  const grid = document.getElementById('featured-grid');
  if (!grid) return;
  grid.innerHTML = picks.map(p => `
    <div class="mini-card">
      <div class="mini-card-img">${PRODUCT_ICONS[p.type]||'✨'}</div>
      <div class="mini-card-body">
        <div class="mini-card-type">${p.type}</div>
        <div class="mini-card-name">${p.name}</div>
        <div class="mini-card-brand">${p.brand}</div>
        <div class="mini-card-footer">
          <span class="mini-card-price">$${Number(p.price).toFixed(2)}</span>
          <button class="catalog-add-btn" onclick="toggleCart(${p.id});event.stopPropagation()" id="cat-atc-${p.id}">+ Cart</button>
        </div>
      </div>
    </div>`).join('');
}

// ── Account Modal ──
function openAccountModal() { document.getElementById('accountOverlay').classList.remove('hidden'); }
function closeAccountModal() { document.getElementById('accountOverlay').classList.add('hidden'); }

function createAccount() {
  const email = document.getElementById('account-email').value.trim();
  const first = document.getElementById('account-first').value.trim();
  if (!email || !first) { showToast('Please enter your name and email'); return; }
  if (!email.includes('@')) { showToast('Please enter a valid email'); return; }
  showToast(`Welcome, ${first}! Account created ✓`);
  document.getElementById('intakeOptional').classList.remove('hidden');
}

function saveIntake() {
  showToast('Profile saved — AI recommendations will improve over time ✓');
  closeAccountModal();
}

// ── Toast ──
function showToast(msg) {
  const t = document.createElement('div');
  t.textContent = msg;
  Object.assign(t.style, {
    position:'fixed', bottom:'28px', left:'50%', transform:'translateX(-50%)',
    background:'#134e4a', color:'white', padding:'12px 24px',
    borderRadius:'100px', fontSize:'0.88rem', fontWeight:'600',
    zIndex:'9999', boxShadow:'0 4px 16px rgba(0,0,0,.22)', transition:'opacity .3s',
    whiteSpace:'nowrap'
  });
  document.body.appendChild(t);
  setTimeout(() => { t.style.opacity='0'; setTimeout(() => t.remove(), 300); }, 2400);
}

// ── Loading ──
function showLoading(show) { document.getElementById('loading-overlay').classList.toggle('hidden', !show); }

// ── Scroll Animations ──
function initScrollReveal() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('revealed');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });

  document.querySelectorAll('.reveal, .reveal-left, .reveal-scale, .stagger').forEach(el => {
    observer.observe(el);
  });
}

function refreshScrollReveal() {
  document.querySelectorAll('.reveal:not(.revealed), .reveal-left:not(.revealed), .reveal-scale:not(.revealed), .stagger:not(.revealed)').forEach(el => {
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight - 40) el.classList.add('revealed');
  });
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add('revealed'); observer.unobserve(entry.target); } });
  }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
  document.querySelectorAll('.reveal:not(.revealed), .reveal-left:not(.revealed), .reveal-scale:not(.revealed), .stagger:not(.revealed)').forEach(el => observer.observe(el));
}

// ── Ripple Effect ──
function addRipple(e) {
  const btn = e.currentTarget;
  const circle = document.createElement('span');
  const d = Math.max(btn.clientWidth, btn.clientHeight);
  const rect = btn.getBoundingClientRect();
  circle.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX-rect.left-d/2}px;top:${e.clientY-rect.top-d/2}px`;
  circle.classList.add('ripple-effect');
  btn.querySelector('.ripple-effect')?.remove();
  btn.appendChild(circle);
}
function initRipples() {
  document.querySelectorAll('.btn-primary').forEach(btn => btn.addEventListener('click', addRipple));
}

// ── Nav Scroll ──
window.addEventListener('scroll', () => {
  document.getElementById('mainNav').classList.toggle('scrolled', window.scrollY > 20);
});

// ── Counter Animation ──
function animateCounters() {
  document.querySelectorAll('.trust-num').forEach(el => {
    const text = el.textContent;
    const num = parseFloat(text.replace(/[^0-9.]/g, ''));
    if (isNaN(num)) return;
    const suffix = text.replace(/[0-9.]/g, '');
    const duration = 900;
    const start = performance.now();
    const update = (now) => {
      const t = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      el.textContent = (num < 10 ? Math.round(num * ease) : Math.round(num * ease)) + suffix;
      if (t < 1) requestAnimationFrame(update);
    };
    requestAnimationFrame(update);
  });
}

// ── Card Tilt (mouse-move 3D effect) ──
function initCardTilt() {
  document.querySelectorAll('.ai-card, .how-step, .ai-proof-item').forEach(card => {
    card.addEventListener('mousemove', e => {
      const rect = card.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = (e.clientX - cx) / (rect.width / 2);
      const dy = (e.clientY - cy) / (rect.height / 2);
      card.style.transform = `translateY(-5px) rotateX(${-dy * 5}deg) rotateY(${dx * 5}deg)`;
      card.style.transition = 'transform .05s';
    });
    card.addEventListener('mouseleave', () => {
      card.style.transform = '';
      card.style.transition = 'transform .4s var(--ease-out)';
    });
  });
}

// ── Magnetic Buttons ──
function initMagneticButtons() {
  document.querySelectorAll('.btn-primary.btn-large, .btn-glass').forEach(btn => {
    btn.addEventListener('mousemove', e => {
      const rect = btn.getBoundingClientRect();
      const dx = (e.clientX - (rect.left + rect.width / 2)) * 0.25;
      const dy = (e.clientY - (rect.top + rect.height / 2)) * 0.25;
      btn.style.transform = `translate(${dx}px, ${dy}px) translateY(-2px)`;
      btn.style.transition = 'transform .1s';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.transform = '';
      btn.style.transition = 'transform .4s var(--ease-out)';
    });
  });
}

// ── Smooth Tab Indicator ──
function initTabIndicator() {
  const tabWrap = document.querySelector('.routine-tabs');
  if (!tabWrap) return;
  const indicator = document.createElement('div');
  Object.assign(indicator.style, {
    position:'absolute', bottom:'4px', left:'4px', height:'calc(100% - 8px)',
    background:'white', borderRadius:'10px', boxShadow:'0 1px 4px rgba(0,0,0,.08)',
    transition:'left .25s var(--ease-out), width .25s var(--ease-out)',
    pointerEvents:'none', zIndex:'0'
  });
  tabWrap.style.position = 'relative';
  tabWrap.prepend(indicator);

  function updateIndicator() {
    const active = tabWrap.querySelector('.tab-btn.active');
    if (!active) return;
    indicator.style.left = active.offsetLeft + 'px';
    indicator.style.width = active.offsetWidth + 'px';
  }
  tabWrap.querySelectorAll('.tab-btn').forEach(btn => {
    btn.style.position = 'relative'; btn.style.zIndex = '1';
    btn.addEventListener('click', () => setTimeout(updateIndicator, 10));
  });
  setTimeout(updateIndicator, 100);
}

// ── Hero Text Typewriter ──
function initHeroTypewriter() {
  const words = ['your skin.', 'your concerns.', 'your budget.', 'your routine.'];
  const target = document.querySelector('.hero-title em');
  if (!target) return;
  let wi = 0, ci = 0, deleting = false;
  function tick() {
    const word = words[wi];
    if (!deleting) {
      target.textContent = word.slice(0, ++ci);
      if (ci === word.length) { deleting = true; return setTimeout(tick, 2800); }
    } else {
      target.textContent = word.slice(0, --ci);
      if (ci === 0) { deleting = false; wi = (wi + 1) % words.length; return setTimeout(tick, 500); }
    }
    setTimeout(tick, deleting ? 70 : 110);
  }
  target.textContent = '';
  setTimeout(tick, 1200);
}


// ── Glow rings on cards ──
function initGlowRings() {
  document.querySelectorAll('.mini-card, .catalog-card, .product-card').forEach(c => c.classList.add('glow-ring'));
}

// ── Init ──
updateProgress(1);
renderFeatured();
loadProducts();
document.addEventListener('DOMContentLoaded', () => {
  initScrollReveal();
  initRipples();
  animateCounters();
  initCardTilt();
  initMagneticButtons();
  initTabIndicator();
  initHeroTypewriter();
  initGlowRings();
});
