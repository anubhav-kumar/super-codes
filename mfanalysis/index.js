const getCallHeaders = () => {
  return {
    accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "accept-language": "en-GB,en-US;q=0.9,en;q=0.8",
    "cache-control": "max-age=0",
    "sec-ch-ua":
      '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"macOS"',
    "sec-fetch-dest": "document",
    "sec-fetch-mode": "navigate",
    "sec-fetch-site": "same-site",
    "sec-fetch-user": "?1",
    "upgrade-insecure-requests": "1",
    cookie:
      "_gid=GA1.2.207252766.1736139688; _ga=GA1.1.585868176.1736139688; _ga_SC6XJV8EE4=GS1.1.1736139687.1.1.1736139757.0.0.0",
    Referer: "https://www.mfapi.in/",
    "Referrer-Policy": "strict-origin-when-cross-origin",
  };
};

const getMutualFundsData = async (mutualFundId) => {
  const url = `https://api.mfapi.in/mf/${mutualFundId}`;
  const response = await fetch(url, {
    headers: getCallHeaders(),
    body: null,
    method: "GET",
  });
  const responseJSON = await response.json();
  const data = {
    name: responseJSON?.["meta"]?.["scheme_name"],
    nav: responseJSON?.["data"],
  };
  return data;
};

const getMonthAndYearFromDate = (navDate) => {
  const [day, month, year] = navDate.split("-");
  return {
    month,
    year,
  };
};

/*
    Return struct
    {
        type: array,
        items: {
            type: object,
            properties: {
                year: number, 
                month: number,
                nav: number
            }
        }
    }
*/
const getMonthlyAverageNAV = (nav) => {
  const navMap = new Map();

  nav.forEach(({ date, nav }) => {
    const { year, month } = getMonthAndYearFromDate(date);
    const key = `${year}-${month}`; // Unique key for year and month

    if (!navMap.has(key)) {
      navMap.set(key, { year, month, totalNAV: 0, count: 0 });
    }

    const entry = navMap.get(key);
    entry.totalNAV += parseFloat(nav);
    entry.count += 1;
  });

  // Convert map entries to the desired output format
  const result = Array.from(navMap.values()).map(
    ({ year, month, totalNAV, count }) => ({
      year,
      month,
      nav: parseFloat((totalNAV / count).toFixed(5)),
    })
  );

  return result;
};

const main = async () => {
  const mutualFundsIds = [149450];
  mutualFundsIds.forEach(async (mutualFundId) => {
    console.log("-------------------------");
    console.log(`Mutual Fund ID: ${mutualFundId}`);
    const { name, nav } = await getMutualFundsData(mutualFundId);
    const monthlyAverageNav = getMonthlyAverageNAV(nav);
    
    return;
  });
};

const getEverHighestDays = async mfId => {
  const {nav} = await getMutualFundsData(mfId);
  // console.log(JSON.stringify(nav));
  // Ever High calculation
  let daysSinceLastEverHighest, everHighSoFar = 0, daysOfEverHighest = [];
  for (let i = nav.length - 1; i >=0; i--) {
    if (parseFloat(nav[i].nav) > parseFloat(everHighSoFar)) {
      everHighSoFar = nav[i].nav;
      daysOfEverHighest.push({
        date: nav[i].date,
        daysSinceLastEverHighest,
        nav: nav[i].nav
      });
      daysSinceLastEverHighest = 1;
    } else {
      daysSinceLastEverHighest = daysSinceLastEverHighest + 1;
    }
  }
  console.log(JSON.stringify(daysOfEverHighest));
};


getEverHighestDays(135320);
