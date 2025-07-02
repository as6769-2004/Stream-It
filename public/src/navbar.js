// Load navbar from partials
fetch('./partials/navbar.html')
  .then(res => res.text())
  .then(html => {
    const navbarContainer = document.createElement('div');
    navbarContainer.innerHTML = html;
    document.body.prepend(navbarContainer);

    // Wait for DOM to inject before operating
    requestAnimationFrame(() => {
      const navTabs = document.getElementById('navTabs');
      const path = window.location.pathname;
      const current = path.split('/').pop();

      const tabs = [
        { name: 'Home', href: 'index.html' },
        { name: 'Join', href: 'viewer.html' },
        { name: 'Host', href: 'host.html' },
        { name: 'Videos', href: 'simpletube.html' },
        { name: 'Sign In', href: 'signup.html' },
      ];

      tabs.forEach(tab => {
        const a = document.createElement('a');
        a.href = tab.href;
        a.textContent = tab.name;
        if (tab.href === current) a.classList.add('active');
        navTabs.appendChild(a);
      });

      const toggleBtn = document.getElementById('menuToggle');
      if (toggleBtn) {
        toggleBtn.onclick = () => {
          navTabs.classList.toggle('open');
        };
      }
    });
  })
  .catch(err => console.error('Navbar load failed:', err));
