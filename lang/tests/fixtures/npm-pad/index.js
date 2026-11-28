// task 55 offline npm fixture: the package itself is a function (like left-pad)
module.exports = (s, n, c = " ") => String(s).padStart(n, c);
