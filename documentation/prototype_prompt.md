Generate a single route Live view page in Elixir Phoenix. 
The page route will be `/livebetting/user/:userid`. 
User ID can be any 6 letter alpha numeric. If it is not a 6 letter alpha numeric, throw an error. 
Every user has an initial balance of Rs. 100/-
The logged in user can bet for either YES or NO with some money at stake. 
Every user should be able to see how much money has been betted on YES and how much on NO and which users have betted how much on YES and NO on the same screen.
For now, we are not having any data in DB. The data remains in-memory only. 
Feel free to use PubSub if you think that is required. Do not use if it is not necessary. 
Keep the architecture simple. Do not over complicate anything. Simple is the best. 