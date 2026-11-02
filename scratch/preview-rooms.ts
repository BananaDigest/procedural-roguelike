import { generateLevel } from "../src/generation/LevelChain.ts";
import { roomToAscii } from "../src/generation/debug.ts";
import { isRoomConnected } from "../src/generation/ConnectivityCheck.ts";

let bad = 0;
const samples: string[] = [];
for (let seed = 1; seed <= 300; seed++) {
  for (const level of [1, 3, 7]) {
    for (const room of generateLevel(seed, level)) {
      if (!isRoomConnected(room)) {
        bad++;
        samples.push(`DISCONNECTED seed=${seed} lvl=${level}\n${roomToAscii(room)}`);
      }
    }
  }
}
for (const [seed, level] of [[2, 1], [5, 1], [11, 3], [23, 7], [42, 1], [77, 3]] as const) {
  const rooms = generateLevel(seed, level);
  const room = rooms[Math.min(1, rooms.length - 1)];
  console.log(`\nseed=${seed} lvl=${level} ${room.w}x${room.h}`);
  console.log(roomToAscii(room));
}
console.log(`\n\nConnectivity failures over all generated rooms: ${bad}`);
for (const s of samples.slice(0, 3)) console.log("\n" + s);
