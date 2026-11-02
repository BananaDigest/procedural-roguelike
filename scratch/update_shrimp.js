import fs from 'fs';

let content = fs.readFileSync('src/render/Renderer.ts', 'utf8');

const oldShrimp = content.substring(
  content.indexOf('      case "shrimp":'),
  content.indexOf('      case "steak":')
);

console.log('Old shrimp length:', oldShrimp.length);

const newShrimp = `      case "shrimp": {
        // Cooked prawn: hooked pink-coral body, segmented shell bands, fan tail & antennae
        const tailX = X + T * 0.09, tailY = Y + T * 0.17;

        // Antennae (curved whiskers sweeping back over the head)
        ctx.strokeStyle = "#ff8066";
        ctx.lineWidth = Math.max(1, T * 0.035);
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(X + T * 0.14, Y - T * 0.16);
        ctx.quadraticCurveTo(X + T * 0.38, Y - T * 0.28, X + T * 0.32, Y + T * 0.04);
        ctx.moveTo(X + T * 0.12, Y - T * 0.18);
        ctx.quadraticCurveTo(X + T * 0.32, Y - T * 0.38, X + T * 0.38, Y - T * 0.08);
        ctx.stroke();

        // Tail fan flukes (telson & uropods)
        ctx.fillStyle = "#c93318";
        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(tailX + T * 0.13, tailY + T * 0.09);
        ctx.lineTo(tailX + T * 0.05, tailY + T * 0.14);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = "#e63e20";
        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(tailX + T * 0.16, tailY + T * 0.03);
        ctx.lineTo(tailX + T * 0.14, tailY + T * 0.11);
        ctx.closePath();
        ctx.fill();

        // Swimmerets (little legs along inner belly)
        ctx.strokeStyle = "#ff7b61";
        ctx.lineWidth = Math.max(1, T * 0.035);
        ctx.beginPath();
        ctx.moveTo(X - T * 0.04, Y + T * 0.04); ctx.lineTo(X - T * 0.01, Y + T * 0.09);
        ctx.moveTo(X + T * 0.01, Y - T * 0.03); ctx.lineTo(X + T * 0.05, Y - T * 0.01);
        ctx.moveTo(X + T * 0.05, Y - T * 0.09); ctx.lineTo(X + T * 0.1, Y - T * 0.13);
        ctx.stroke();

        // Main curled body
        ctx.beginPath();
        ctx.moveTo(X + T * 0.22, Y - T * 0.15); // rostrum tip
        ctx.bezierCurveTo(X + T * 0.18, Y - T * 0.25, X + T * 0.04, Y - T * 0.26, X - T * 0.12, Y - T * 0.2);
        ctx.bezierCurveTo(X - T * 0.28, Y - T * 0.12, X - T * 0.28, Y + T * 0.14, X - T * 0.1, Y + T * 0.22);
        ctx.bezierCurveTo(X - T * 0.02, Y + T * 0.24, X + T * 0.06, Y + T * 0.21, tailX, tailY);
        ctx.bezierCurveTo(X - T * 0.02, Y + T * 0.14, X - T * 0.12, Y + T * 0.08, X - T * 0.12, Y - T * 0.04);
        ctx.bezierCurveTo(X - T * 0.12, Y - T * 0.12, X + T * 0.02, Y - T * 0.14, X + T * 0.13, Y - T * 0.08);
        ctx.closePath();

        ctx.fillStyle = "#ff6243";
        ctx.fill();
        ctx.strokeStyle = "#c93318";
        ctx.lineWidth = Math.max(1, T * 0.032);
        ctx.stroke();

        // Segment stripes across the back shell
        ctx.strokeStyle = "#ffe6df";
        ctx.lineWidth = Math.max(1, T * 0.045);
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(X + T * 0.03, Y - T * 0.24); ctx.lineTo(X + T * 0.07, Y - T * 0.11);
        ctx.moveTo(X - T * 0.15, Y - T * 0.18); ctx.lineTo(X - T * 0.08, Y - T * 0.06);
        ctx.moveTo(X - T * 0.22, Y - T * 0.01); ctx.lineTo(X - T * 0.12, Y + T * 0.02);
        ctx.moveTo(X - T * 0.17, Y + T * 0.15); ctx.lineTo(X - T * 0.06, Y + T * 0.15);
        ctx.stroke();
        ctx.lineCap = "butt";

        // Eye dot
        ctx.fillStyle = "#1a1614";
        ctx.beginPath();
        ctx.arc(X + T * 0.14, Y - T * 0.16, Math.max(1.2, T * 0.035), 0, Math.PI * 2);
        ctx.fill();
        break;
      }
`;

content = content.replace(oldShrimp, newShrimp);
fs.writeFileSync('src/render/Renderer.ts', content, 'utf8');
console.log('Successfully updated Renderer.ts with new shrimp design!');

