const q = require('./docs/data/questions.json');
console.log(q.filter(x => x.topic === 'csharp').length);
