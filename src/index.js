var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/renderHtml.ts
import htmlContent from "./rainfall_monitor.html";
function renderHtml(content) {
  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>D1</title>
        <link rel="stylesheet" type="text/css" href="https://static.integrations.cloudflare.com/styles.css">
      </head>
    
      <body>
        <header>
          <img
            src="https://imagedelivery.net/wSMYJvS3Xw-n339CbDyDIA/30e0d3f6-6076-40f8-7abb-8a7676f83c00/public"
          />
          <h1>\u{1F389} Successfully connected d1-template to D1</h1>
        </header>
        <main>
          <p>Your D1 Database contains the following data:</p>
          <pre><code><span style="color: #0E838F">&gt; </span>SELECT * FROM comments LIMIT 3;<br>${content}</code></pre>
          <small class="blue">
            <a target="_blank" href="https://developers.cloudflare.com/d1/tutorials/build-a-comments-api/">Build a comments API with Workers and D1</a>
          </small>
        </main>
      </body>
    </html>
`;
}
// __name(renderHtml, "renderHtml");


// Define standard CORS headers
// const corsHeaders = {
//   "Access-Control-Allow-Origin": "*", // Change to your specific domain if preferred
//   "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
//   "Access-Control-Allow-Headers": "Content-Type",
// };
const getCorHeaders = (request) =>{
  const requestOrigin = request.headers.get("Origin") || "*";
  return {
    "Access-Control-Allow-Origin": requestOrigin,
    "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    // "Vary": "Origin"
  };
}

const messageLINE = async (workerTime, count) => {
  const date = new Date(workerTime + 8*60*60*1000);
  const month = String(date.getMonth() + 1); // Months are 0-11
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const customFormat = ` ${month} 月 ${day} 日 ${hours}:${minutes}`;

  const header = {
    "Content-Type": "application/json",
    "Authorization": "Bearer " + env.LINE_TOKEN
  };
  const body = JSON.stringify({
    "to": env.LINE_USER_ID,
    "messages": [
    {
      "type": "text",
      "text": `$$$$$$$\r\n現在時間 ${customFormat}\r\n過去最近 5 分鐘內\r\n累計降下 ${count * 5} mm 雨量`,
      "emojis":[
          {"index": 0, "productId": "5ac21a8c040ab15980c9b43f", "emojiId": "023"},
          {"index": 1, "productId": "5ac21a8c040ab15980c9b43f", "emojiId": "001"},
          {"index": 2, "productId": "5ac21a8c040ab15980c9b43f", "emojiId": "018"},
          {"index": 3, "productId": "5ac21a8c040ab15980c9b43f", "emojiId": "014"},
          {"index": 4, "productId": "5ac21a8c040ab15980c9b43f", "emojiId": "009"},
          {"index": 5, "productId": "5ac21a8c040ab15980c9b43f", "emojiId": "014"},
          {"index": 6, "productId": "5ac21a8c040ab15980c9b43f", "emojiId": "007"}
      ]
    }
    ],
    "notificationDisabled": false
  });
  await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: header,
    body: body
  });
}

// src/index.ts
var index_default = {
  async fetch(request, env) {
    // 1. Handle CORS Preflight requests sent automatically by browsers
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: getCorHeaders(request)
      });
    }
    // 檢查是否為 POST 請求
    if (request.method === "POST") {
      try {
        // 解析感測器傳來的 JSON 資料
        const sensorData = await request.json();

        // 檢查 token
        const token = sensorData.token;
        if(token !== "just like TT!") return new Response("Unauthorized access", {status: 401})
        
        // 假設感測器傳來 { "temperature": 25.5, "humidity": 60 }
        const mcuTime = sensorData.mcuTimestamp;
        const count = sensorData.gaugeTiltCount;
        const workerTime = Date.now();
        // const date = new Date(workerTime); // UTC+8
        // const year = date.getFullYear();
        // const month = date.getMonth() + 1;
        // const DATE = date.getDate();
        // const hour = date.getHours();

        // 將資料寫入 D1 資料庫
        await env.DB.prepare(
          "INSERT INTO rainRecords (WorkerTimeStamp, TiltCount) VALUES (?, ?)"
          // "INSERT INTO rainGauge (mcuTimestamp, gaugeTiltCount, workerTimestamp, year, month, date, hour) VALUES (?, ?, ?, ?, ?, ?, ?)"
        )//.bind(mcuTime, count, workerTime, year, month, DATE, hour).run();
        .bind(workerTime ?? null, count ?? null).run();

        // 查詢過去歷史資料看是否符合報警條件
        const { results } = await env.DB.prepare(
          `SELECT TiltCount
          FROM rainRecords
          ORDER BY WorkerTimeStamp DESC LIMIT 6`
        ).all();
        if (results && results.length > 0) {
          const latest = results[0]; // 最近的一筆
          const others = results.slice(1); // 其餘的筆數

          // 條件 1: 最近一筆大於等於 20
          const isLatestAlert = latest.TiltCount >= 20;
          
          // 條件 2: 其餘紀錄全部都小於 20 (皆無警報)
          const areOthersQuiet = others.every(record => record.TiltCount < 20);

          if (isLatestAlert && areOthersQuiet) {
            messageLINE(workerTime, count);
          }
        }

        return new Response("Data received and saved", { status: 201 });
      } catch (error) {
        console.log(error);
        return new Response("Invalid JSON or Database error", { status: 400 });
      }
    }
    else if(request.method === "GET"){
      // 原有的 GET 邏輯：顯示資料庫內容

      // ?temp=25.5&humi=60
      // ?equality=(gt,lt,geq,leq)&workerTimestamp=1xxx
      const url = new URL(request.url);

      const beginTime = url.searchParams.get("beginTime");
      const endTime = url.searchParams.get("endTime");
      // return webpage
      if(beginTime == null && endTime == null){
        return new Response(htmlContent, {
          headers: {
            "content-type": "text/html;charset=UTF-8",
            ...getCorHeaders(request)
          },
        });
      }

      if(beginTime == null || endTime == null){
        return new Response("Invalid null parameter", {status: 400});
      }

      // 如果時間長度超過一個禮拜，7*24*60*60秒，那麼就限制 endTime
      const MAX_RANGE_MS = 7 * 24 * 60 * 60 * 1000;
      const cappedEndTime = Math.min(endTime, beginTime + MAX_RANGE_MS);
      if (cappedEndTime < beginTime) {
        return new Response("Invalid parameter: endTime < beginTime", { status: 400 });
      }

      const { results } = await env.DB.prepare(
        `SELECT WorkerTimeStamp, TiltCount
        FROM rainRecords
        WHERE WorkerTimeStamp >= ? AND WorkerTimeStamp <= ?`
      ).bind(beginTime, cappedEndTime).all();

      // // const results = new Date(Date.now() + 8*60*60*1000).toISOString();
      return new Response(JSON.stringify(results, null, 2), {
        headers: {
          "content-type": "application/json",
          ...getCorHeaders(request)
        }
      });
    }

  }
};
export {
  index_default as default
};
//# sourceMappingURL=index.js.map
/*CREATE TABLE "rainGauge"(
  "mcuTimestamp" INTEGER NOT NULL,
  "gaugeTiltCount" INTEGER NOT NULL,
  "workerTimestamp" INTEGER NOT NULL,
  "year" INTEGER NOT NULL,
  "month" INTEGER NOT NULL,
  "date" INTEGER NOT NULL,
  "hour" INTEGER NOT NULL,
  PRIMARY KEY ("mcuTimestamp", "workerTimestamp")
) */

/*
{
  "mcuTimestamp": 1024,
  "gaugeTiltCount": 11,
}
 */