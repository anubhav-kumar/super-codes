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
    tools=[get_weather],
    system_prompt="""
You are a weather assistant.

Always use the get_weather tool when asked about weather.

Return ONLY valid JSON in this format:
{
  "city": "...",
  "temperature": number,
  "humidity": "...",
  "rainfall": "...",
  "aqi": number
}

Do not add any explanation.
Do not change tool output.
Do not hallucinate.
"""
)

print("Deep agent created and ready to be invoked")

# Run the agent
print("Running agent invoke now")
result = agent.invoke(
    {"messages": [{"role": "user", "content": "What is the weather in Mumbai?"}]}
)

# Extract tool output directly
tool_output = [m for m in result["messages"] if m.type == "tool"][-1].content

print(tool_output)
