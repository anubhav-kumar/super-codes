const getDataByProjectId = async projectId => {
  const response = await fetch("https://maharerait.maharashtra.gov.in/api/maha-rera-project-registration-service/projectregistartion/getMigratedBuildingDetails", {
    "headers": {
      "accept": "application/json, text/plain, */*",
      "accept-language": "en-US,en;q=0.9",
      "authorization": "Bearer eyJhbGciOiJSUzI1NiIsInR5cCIgOiAiSldUIiwia2lkIiA6ICIzNHFoLWJQZ1Nyck5WdG92Z1FROUhuX3JfZHhGeV9mUDVJVjkzT1VXMVVjIn0.eyJleHAiOjE3MzU1NzA3OTAsImlhdCI6MTczNTU2NDc5MCwianRpIjoiMzgyYTgzZTgtZWRiMy00MmY1LTllNDYtMGRkZjQzZTI1M2E3IiwiaXNzIjoiaHR0cDovL2JhY2tlbmQtc3RhbmRhbG9uZS1rZXljbG9hay1zdmMtcHJvZDo4MDg5L2F1dGgvcmVhbG1zL2RlbW8iLCJhdWQiOiJhY2NvdW50Iiwic3ViIjoiODJkMjlhYzktNDVlYi00YzI1LWJiOTAtZmRlYWJjZGU3OGZjIiwidHlwIjoiQmVhcmVyIiwiYXpwIjoiZGVtb2NsaWVudDEiLCJzZXNzaW9uX3N0YXRlIjoiODUwMzNkNGYtMzdhZi00MTZmLWE0ZmYtYjNhNGM5NGRmZjkxIiwiYWNyIjoiMSIsImFsbG93ZWQtb3JpZ2lucyI6WyIqIl0sInJlYWxtX2FjY2VzcyI6eyJyb2xlcyI6WyJvZmZsaW5lX2FjY2VzcyIsImFwcF9hZ2VudCIsInVtYV9hdXRob3JpemF0aW9uIl19LCJyZXNvdXJjZV9hY2Nlc3MiOnsiZGVtb2NsaWVudDEiOnsicm9sZXMiOlsiQUdFTlQiXX0sImFjY291bnQiOnsicm9sZXMiOlsibWFuYWdlLWFjY291bnQiLCJtYW5hZ2UtYWNjb3VudC1saW5rcyIsInZpZXctcHJvZmlsZSJdfX0sInNjb3BlIjoiZW1haWwgcHJvZmlsZSIsImVtYWlsX3ZlcmlmaWVkIjpmYWxzZSwicHJlZmVycmVkX3VzZXJuYW1lIjoiQG1haGFyZXJhX3B1YmxpY192aWV3In0.Ud2FJPNmvDKym3vRHAIFSg9USBmQx9KYrMTfdjW8uXeVztZE_G4uDwo7P7b1o38vnLNUXSq0dYWt_7Xq7avhkuKf7rZr_s-RVxzNSf0q97vz8EHpWOpu-qd-YDZb95DzyLo2foDVKonmnPdprYqdxBCuilvEoa9eFctWec6U0becfCQ2tyPRgJXTJgEoiCxht3fkuioYh_LsROTY_VCjaOJMzq_0ITR9ttDJSUzldKnToz5PW-zrJhxXnjJp7KMPP_aKJrqVEdFjjMmehh6ubQgUGQaKqNzDuJAaX_yOFwNx5H49JEGaBVuZYmgUADKsmfpHF_6sukqueb8CELAxMA",
      "content-type": "application/json",
      "priority": "u=1, i",
      "sec-ch-ua": "\"Google Chrome\";v=\"131\", \"Chromium\";v=\"131\", \"Not_A Brand\";v=\"24\"",
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": "\"macOS\"",
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-origin",
      "cookie": "_ga=GA1.1.168010038.1735563508; Path=/; _ga_GDQ94DH7QZ=GS1.1.1735563507.1.1.1735563712.0.0.0; JSESSIONID=A8885A93E743D2AB9B8DCA94B001ECEE",
      "Referer": "https://maharerait.maharashtra.gov.in/project/view/5792",
      "Referrer-Policy": "strict-origin-when-cross-origin"
    },
    "body": JSON.stringify({projectId}),
    "method": "POST"
  });
  const responseText = await response.text()
  return responseText;
};

const main = async () => {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    const projectIds = [43390, 43391, 43392, 43393, 43394];
    projectIds.forEach(async (projectId) => {
      const data = await getDataByProjectId(projectId);
      console.log(`------ Project ID ${projectId} Starts ------`);
      console.log(data);
      console.log(`------ Project ID ${projectId} Ends ------`);
    });
}

main();