# Housie Game

## Types of users
1. **Admin user: -** Should be able to add players and assign multiple tickets to the player
2. **User: -** View the status of their ticket and the leaderboard

## Requirements
1. Admin should be able to start a game. 
2. Admin should be able to add player to the game. 
3. Admin should be draw the number and mark it on the screen
4. User should be able to view their tickets
5. [Future] User should be able to view the Leaderboards

## Api Requirements
1. POST_CREATE_GAME: Create a game with a game. Return game id
2. POST_ADD_PLAYER: Create a player inside the game. Input - Player Name and Game Id. Output - Player Id
3. POST_START_GAME: Start a game. A game once started cannot accept more players. 
4. POST_NUMBER_DRAW: Draw the number in the game.

## Socket Connections
1. Admin user socket connection: 
    - Get update on when a ticket has hit the pattern
    - Display live winners on the dashboard of a pattern
2. User socket connection:
    - Check the status of their ticket and numbers drawn.
    - Check what patterns are remaining

## Deployment
#### Script on remote server
```
rm -rf src && rm -f src.zip && \
aws s3 cp s3://housie-ec2-deployment-739418138388/src.zip . && \
unzip -o src.zip && \
aws s3 cp s3://housie-ec2-deployment-739418138388/package.json . && \
npm install && \
node src/server.js 
````

#### Script on local machine
```
rm src.zip && zip src.zip src/* && \
aws s3 cp src.zip s3://housie-ec2-deployment-739418138388 && \
aws s3 cp package.json s3://housie-ec2-deployment-739418138388
```