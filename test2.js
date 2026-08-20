const fs = require('fs');
const questions = JSON.parse(fs.readFileSync('./docs/data/questions.json', 'utf8'));
const topics = JSON.parse(fs.readFileSync('./docs/data/topics.json', 'utf8'));
const topicId = 'csharp';
const topic = topics.find(t => t.id === topicId);
console.log("Topic:", topic ? topic.title : "Not found");
const byLevel = {};
for (const q of questions.filter(q => q.topic === topicId)) {
  (byLevel[q.level] = byLevel[q.level] || []).push(q);
}
console.log("Questions by level:", Object.keys(byLevel));
