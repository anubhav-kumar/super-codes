from openai import OpenAI
client = OpenAI()
completion = client.chat.completions.create(
    model="gpt-3.5-turbo-0125",
    store=True,
    messages=[
        {"role": "user", "content": "write a haiku about ai"}
    ]
)
print(completion)