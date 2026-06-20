import fs from 'fs';
import pdf from 'pdf-parse';

async function main() {
  const buffer = fs.readFileSync('data/manuals/MT cardioline-2100.pdf');
  const data = await pdf(buffer);
  console.log("Pages:", data.numpages);
  console.log("Length of text:", data.text.length);
  fs.writeFileSync('data/cardioline_text.txt', data.text);
  console.log("Saved text to data/cardioline_text.txt");
}

main().catch(console.error);
