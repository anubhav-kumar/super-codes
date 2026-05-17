const fs = require('fs');

const main = async () => {
    const TOTAL = 50;
    let completed = 0, written = 0, dupes = 0, failed = 0;

    const log = () =>
        process.stdout.write(`\r⏳ ${completed}/${TOTAL} fetched | ✅ ${written} written | 🔁 ${dupes} dupes | ❌ ${failed} failed`);

    log();

    const requestPromises = Array.from({ length: TOTAL }, (_, i) =>
        fetch("https://sudoku.com/api/v2/classic/hard/app_start", {
            headers: {
                "accept": "*/*",
                "accept-language": "en-US,en;q=0.9",
                "cache-control": "no-cache",
                "excludeids": "e433,r777,e637,r616,e883,e378,m358,h79,e61",
                "priority": "u=1, i",
                "sec-ch-ua": "\"Chromium\";v=\"148\", \"Google Chrome\";v=\"148\", \"Not/A)Brand\";v=\"99\"",
                "sec-ch-ua-mobile": "?0",
                "sec-ch-ua-platform": "\"macOS\"",
                "sec-fetch-dest": "empty",
                "sec-fetch-mode": "cors",
                "sec-fetch-site": "same-origin",
                "x-easy-locale": "en",
                "x-requested-with": "XMLHttpRequest",
                "cookie": "_ga=GA1.1.840422983.1775894438; mode=classic; ab_test=ab_storybook_desktop%3Dab_storybook_desktop_hard%26dt%3D1779005713; first_visit=fv%3D1775894437%26dt%3D1779005713; __cflb=02DiuE7hKpaqvCsoqtTrKvfsPpYGyrLgYR5dKv6SFU1oa; _gcl_au=1.1.1586256674.1779005714; cto_bundle=AgwOKV9OeHAySU81RzNOQlhQdDFRRlMyRHpvQ0lLZlpiRkVvOWhpMUVhd2FsQlpwWXQxclV6bnNTdyUyQmhpJTJGU3QlMkZhTmxWRTJZZkZ6OE40R3l6ciUyRlk3eUVRbTBGVjZGa09EN3lya1ZPSVpTUzFWaE9LOWZIeVFEZTA4WFgyZ3RVb3NLRUNEaklBWjZaSXJWQkQ3RyUyRkZzNHdvVG13JTNEJTNE; _ga_LKCCSV4WGG=GS2.1.s1779005714$o33$g1$t1779005843$j60$l0$h0",
                "Referer": "https://sudoku.com/"
            },
            method: "GET"
        }).then(resp => resp.json())
    );

    const idSet = new Set();

    await Promise.all(
        requestPromises.map(promise =>
            promise
                .then(async resp => {
                    completed++;
                    if (!idSet.has(resp.id)) {
                        idSet.add(resp.id);
                        await fs.promises.appendFile("output.jsonl", JSON.stringify(resp) + "\n", "utf-8");
                        written++;
                    } else {
                        dupes++;
                    }
                    log();
                })
                .catch(err => {
                    failed++;
                    log();
                })
        )
    );

    console.log(`\n🏁 Done — ${written} written, ${dupes} dupes skipped, ${failed} failed`);
}

main();