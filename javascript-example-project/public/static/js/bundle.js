// Minimal React-like UI without build tools
(function(){
  function h(tag, props, ...children){
    const el = document.createElement(tag);
    for (const k in props){
      if (k.startsWith('on') && typeof props[k] === 'function'){
        el.addEventListener(k.slice(2).toLowerCase(), props[k]);
      } else if (k === 'style' && typeof props[k] === 'object'){
        Object.assign(el.style, props[k]);
      } else {
        el.setAttribute(k, props[k]);
      }
    }
    children.flat().forEach(c => {
      el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return el;
  }

  function render(root, app){
    root.innerHTML = '';
    root.appendChild(app);
  }

  function Login({onLogin}){
    const username = document.createElement('input');
    username.placeholder = 'username';
    const password = document.createElement('input');
    password.placeholder = 'password';
    password.type = 'password';
    const btn = document.createElement('button');
    btn.textContent = 'Login';
    btn.addEventListener('click', async () => {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ username: username.value, password: password.value })
      });
      if (res.ok) onLogin(); else alert('login failed');
    });
    return h('div', {}, username, password, btn);
  }

  function Widgets({onLogout}){
    const container = h('div', { style: { padding: '10px' } });
    const title = h('h2', {}, 'Widgets');
    const list = h('div', { style: { display: 'flex', gap: '10px', flexWrap: 'wrap' } });
    const btn = h('button', { onClick: onLogout }, 'Logout');
    container.appendChild(title);
    container.appendChild(btn);
    container.appendChild(list);

    async function load(){
      list.innerHTML = 'Loading...';
      const res = await fetch('/api/widgets');
      if (!res.ok){
        list.innerHTML = 'Failed to load widgets';
        return;
      }
      const widgets = await res.json();
      list.innerHTML = '';
      widgets.forEach(w => {
        const card = h('div', { style: { border: '1px solid #ccc', padding: '10px', width: '180px', borderRadius: '4px' } },
          h('h3', {}, w.name),
          h('p', {}, w.description || ''),
          h('p', {}, '$' + parseFloat(w.price).toFixed(2))
        );
        list.appendChild(card);
      });
    }

    load();
    return container;
  }

  function Dashboard({onLogout, user}){
    // Show widgets screen after login
    return Widgets({ onLogout });
  }

  async function App(){
    const root = document.getElementById('root');
    async function check(){
      const res = await fetch('/api/me');
      if (res.ok){
        const user = await res.json();
        render(root, Dashboard({ onLogout: async () => { await fetch('/api/logout', { method: 'POST' }); check(); }, user }));
      } else {
        render(root, Login({ onLogin: check }));
      }
    }
    check();
  }

  App();
})();
