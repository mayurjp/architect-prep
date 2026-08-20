const fs = require('fs');
const path = require('path');

const contentDir = path.join(__dirname, '../content');

function splitFile(sourceFile, splitRules, defaultFile) {
  const sourcePath = path.join(contentDir, sourceFile);
  if (!fs.existsSync(sourcePath)) return;
  
  const text = fs.readFileSync(sourcePath, 'utf8');
  const sections = text.split(/(?=\n## (?:Beginner|Intermediate|Advanced|Scenario) — Question \d+)/g);
  
  const outFiles = {};
  
  // The first section is usually the title/header
  const header = sections[0];
  
  for (let i = 1; i < sections.length; i++) {
    const sec = sections[i];
    if (sec.includes('# PART B')) break; // stop if we hit part B
    
    // figure out which file it goes to
    let target = defaultFile;
    for (const rule of splitRules) {
      if (sec.match(rule.regex)) {
        target = rule.file;
        break;
      }
    }
    
    if (!outFiles[target]) outFiles[target] = [];
    outFiles[target].push(sec);
  }
  
  for (const [file, body] of Object.entries(outFiles)) {
    let newHeader = `# ${file} — Q&A\n\n`;
    // We also need to fix the numbering in the new files
    let outText = body.join('');
    
    // Fix numbering per level
    const levels = ['Beginner', 'Intermediate', 'Advanced', 'Scenario'];
    levels.forEach(lvl => {
      let qNum = 1;
      const regex = new RegExp(`## ${lvl} — Question \\d+\\s+\\*\\*Q\\d+:`, 'g');
      outText = outText.replace(regex, (match) => {
        const res = `## ${lvl} — Question ${qNum}\n\n**Q${qNum}:`;
        qNum++;
        return res;
      });
    });
    
    fs.writeFileSync(path.join(contentDir, file + '.md'), newHeader + outText);
  }
}

// 1. C# & .NET
splitFile('csharp-dotnet-fundamentals.md', [
  { regex: /Garbage Collection|GC|using statement|IDisposable|Task|Thread|async\/await|ConfigureAwait|Span|Memory|synchronization|lock|Mutex|Semaphore|dispose pattern|memory leaks|Task\.Run/i, file: 'dotnet' }
], 'csharp');

// 2. Web API, REST & HTTP
splitFile('aspnet-webapi-rest-http.md', [
  { regex: /REST|idempotent|HATEOAS/i, file: 'rest' },
  { regex: /HTTP|status codes|HTTPS|CORS/i, file: 'http' }
], 'webapi');

// 3. EF & SQL Server
splitFile('entity-framework-sql-server.md', [
  { regex: /SQL|JOIN|WHERE|index|stored procedure|trigger|CTE|transaction/i, file: 'sql-server' }
], 'ef-core');

// 4. OOP & Design Principles
splitFile('oop-design-principles.md', [
  { regex: /SOLID|DRY|YAGNI|KISS|composition/i, file: 'design-principles' }
], 'oop');

// 5. Microservices & System Design
splitFile('microservices-system-design.md', [
  { regex: /CAP|Caching|Load Balancing|Sharding|Scalability|Observability|System Design/i, file: 'system-design' }
], 'microservices');

// 6. Security & Identity
splitFile('security-identity.md', [
  { regex: /OAuth|OIDC|JWT|Identity|RBAC|ABAC/i, file: 'identity' }
], 'app-security');

// 7. ASP.NET & MVC
splitFile('aspnet-mvc.md', [
  { regex: /MVC|View|Routing|Controller|Action Result/i, file: 'mvc' }
], 'aspnet-core');

console.log("Splitting complete.");
