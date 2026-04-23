# pip install -qU deepagents langchain-ollama
from deepagents import create_deep_agent

def get_weather(city: str) -> dict:
    """Get weather for a given city."""
    return {
        "city": city,
        "temperature": 42,
        "humidity": "moderate",
        "rainfall": "less likely",
        "aqi": 90
    }


print("Creating deep agent")
agent = create_deep_agent(
    model="ollama:qwen3.5:9b",
    tools=[],
    system_prompt="""
You are a search engine research expert. 

Given an input by the user, you need to think the google search queries around that input. 

You DO NOT have to actually perform google search, you only have to give me the search queries that are to be searched. 
Do not try to answer the question yourself or generate your own actual content. 

Output should be strictly in an Array. Do not write anything else. Your output would be directly parsed in the code. So ensure your output is an array. 

For example if the user asks - "Who is the richest Indian man ?", 
You can think of search queries like - 

["Richest Indian Man 2026", "Richest man in India latest news", "List of richest men in India 2026"]

Do not hallucinate.



User input is - 
Which teams are playing IPL this year ?
"""
)

print("Deep agent created and ready to be invoked")

# Run the agent
print("Running agent invoke now")
result = agent.invoke(
    {"messages": [{"role": "user", "content": "Which teams are playing IPL this year ?"}]}
)

# Extract tool output directly
tool_output = [m for m in result["messages"] if m.type == "tool"][-1].content

print(tool_output)
