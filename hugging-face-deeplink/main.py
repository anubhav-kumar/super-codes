from transformers import AutoTokenizer, AutoModelForCausalLM
import torch

# Load tokenizer and model
tokenizer = AutoTokenizer.from_pretrained("openai-community/gpt2", trust_remote_code=True)
model = AutoModelForCausalLM.from_pretrained("openai-community/gpt2", revision="fp32", torch_dtype=torch.float32, trust_remote_code=True)

device = "cuda" if torch.cuda.is_available() else "cpu"
model.to(device)
model.eval()

# Conversation loop
chat_history = []

print("🤖 GPT-2 Chatbot (type 'exit' to quit)\n")

while True:
    user_input = input("You: ")
    if user_input.lower() in ["exit", "quit"]:
        break

    chat_history.append(f"You: {user_input}")
    chat_prompt = "\n".join(chat_history) + "\nAI:"

    # Tokenize and generate
    inputs = tokenizer(chat_prompt, return_tensors="pt").to(device)
    outputs = model.generate(
        **inputs,
        max_new_tokens=100,
        pad_token_id=tokenizer.eos_token_id,  # avoids warnings
        do_sample=True,
        temperature=0.7,
        top_k=50
    )

    # Decode only new response
    generated_text = tokenizer.decode(outputs[0], skip_special_tokens=True)
    response = generated_text[len(chat_prompt):].strip().split("\n")[0]

    print(f"AI: {response}")
    chat_history.append(f"AI: {response}")
