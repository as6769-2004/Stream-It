// Firebase Config
const firebaseConfig = {
  apiKey: "AIzaSyCraQviZFsN5DNtATLHS7R4JdqvBH0le_I",
  authDomain: "stream-platform-2025.firebaseapp.com",
  projectId: "stream-platform-2025",
  appId: "1:6102817020:web:3b997f096a2f89d0eadf79"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const provider = new firebase.auth.GoogleAuthProvider();

// DOM Elements
const googleBtn = document.getElementById('googleBtn');
const profile = document.getElementById('profile');
const profilePic = document.getElementById('profilePic');
const displayName = document.getElementById('displayName');
const continueBtn = document.getElementById('continueBtn');
const status = document.getElementById('status');

// Sign In Logic
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

// Continue Button Logic
continueBtn.onclick = () => {
  window.location.href = 'home.html';
};

// Auto-Login Check
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
