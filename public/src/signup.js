const auth = firebase.auth();
const provider = new firebase.auth.GoogleAuthProvider();

const googleBtn = document.getElementById('googleBtn');
const profile = document.getElementById('profile');
const profilePic = document.getElementById('profilePic');
const displayName = document.getElementById('displayName');
const continueBtn = document.getElementById('continueBtn');
const status = document.getElementById('status');

googleBtn.onclick = () => {
  auth.signInWithPopup(provider)
    .then(result => {
      const user = result.user;
      profilePic.src = user.photoURL;
      displayName.textContent = user.displayName;
      profile.style.display = '';
      continueBtn.style.display = '';
      googleBtn.style.display = 'none';
      status.textContent = '';
    })
    .catch(err => {
      status.textContent = err.message;
    });
};

continueBtn.onclick = () => {
  window.location.href = 'viewer.html';
};

auth.onAuthStateChanged(user => {
  if (user) {
    profilePic.src = user.photoURL;
    displayName.textContent = user.displayName;
    profile.style.display = '';
    continueBtn.style.display = '';
    googleBtn.style.display = 'none';
    status.textContent = '';
  }
});
