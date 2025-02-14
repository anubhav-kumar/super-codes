const players = [
  { "name": "Anubhav", "batting": 3, "bowling": 2 },
  { "name": "Rahul", "batting": 5, "bowling": 1 },
  { "name": "Vikram", "batting": 2, "bowling": 4 },
  { "name": "Sahil", "batting": 4, "bowling": 3 },
  { "name": "Neha", "batting": 3, "bowling": 5 },
  { "name": "Amit", "batting": 1, "bowling": 4 },
  { "name": "Pooja", "batting": 4, "bowling": 2 },
  { "name": "Karan", "batting": 2, "bowling": 3 },
  { "name": "Sneha", "batting": 5, "bowling": 4 },
  { "name": "Manish", "batting": 3, "bowling": 3 },
  { "name": "Rohan", "batting": 4, "bowling": 1 },
  { "name": "Divya", "batting": 2, "bowling": 5 },
  { "name": "Nikhil", "batting": 3, "bowling": 2 },
  { "name": "Ayesha", "batting": 4, "bowling": 3 },
  { "name": "Varun", "batting": 1, "bowling": 4 },
  { "name": "Meera", "batting": 5, "bowling": 2 },
  { "name": "Sandeep", "batting": 3, "bowling": 3 },
  { "name": "Ishita", "batting": 2, "bowling": 4 },
  { "name": "Ravi", "batting": 4, "bowling": 2 },
  { "name": "Tanya", "batting": 5, "bowling": 1 },
  { "name": "Umesh", "batting": 3, "bowling": 4 },
  { "name": "Anjali", "batting": 2, "bowling": 5 },
  { "name": "Harsh", "batting": 4, "bowling": 3 },
  { "name": "Bhavya", "batting": 3, "bowling": 2 },
  { "name": "Yash", "batting": 5, "bowling": 4 },
  { "name": "Preeti", "batting": 2, "bowling": 3 },
  { "name": "Raj", "batting": 4, "bowling": 1 },
  { "name": "Simran", "batting": 3, "bowling": 5 },
  { "name": "Vivek", "batting": 2, "bowling": 4 },
  { "name": "Kriti", "batting": 5, "bowling": 2 },
  { "name": "Alok", "batting": 3, "bowling": 3 },
  { "name": "Sonali", "batting": 4, "bowling": 1 },
  { "name": "Gaurav", "batting": 2, "bowling": 5 },
  { "name": "Isha", "batting": 3, "bowling": 2 },
  { "name": "Deepak", "batting": 5, "bowling": 4 },
  { "name": "Kavya", "batting": 2, "bowling": 3 },
  { "name": "Tarun", "batting": 4, "bowling": 1 },
  { "name": "Neeraj", "batting": 3, "bowling": 5 },
  { "name": "Ritika", "batting": 2, "bowling": 4 }
];

function getRandomNumber(length) {
  return Math.floor(Math.random() * (length + 1) );
}

const getRandomTeams = (players) => {
  let teamA = [], teamB = [], teamC =[], playersLeft = players, length = players.length;
  while (playersLeft.length) {
    let index;
    index = getRandomNumber(playersLeft.length - 1);
    teamA.push(playersLeft[index]);
    playersLeft = playersLeft.filter((v,i) => i != index);
    

    index = getRandomNumber(playersLeft.length - 1);
    teamB.push(playersLeft[index]);
    playersLeft = playersLeft.filter((v,i) => i != index);
    
    index = getRandomNumber(playersLeft.length - 1);
    teamC.push(playersLeft[index]);
    playersLeft = playersLeft.filter((v,i) => i != index);
  }

  return [teamA, teamB, teamC];
}

const getTeamDiff = (team, averageBallingSkills, averageBattingSkills) => {
  let teamBowlingAverage = 0;
  let teamBowlingTotal = 0;
  team.forEach(player => {
    teamBowlingTotal = player.bowling;
  })
  teamBowlingAverage = teamBowlingTotal / team.length;
  
  let teamBattingAverage = 0;
  let teamBattingTotal = 0;
  team.forEach(player => {
    teamBattingTotal = player.batting;
  })
  teamBattingAverage = teamBattingTotal / team.length;
  

  return ((Math.abs(averageBallingSkills - teamBowlingAverage) + Math.abs(averageBattingSkills - teamBattingAverage)));
}

const getDifference = (teamA, teamB, teamC, averageBallingSkills, averageBattingSkills) => {
  const teamADiff = getTeamDiff(teamA, averageBallingSkills, averageBattingSkills);
  const teamBDiff = getTeamDiff(teamB, averageBallingSkills, averageBattingSkills);
  const teamCDiff = getTeamDiff(teamC, averageBallingSkills, averageBattingSkills);
  return (teamADiff + teamBDiff + teamCDiff);  
}

function main() {
  let totalBattingSkills = 0, totalBowlingSkills = 0, averageBallingSkills = 0, averageBattingSkills = 0;
  let minimumDifference = 1000;
  let finalTeams;
  players.forEach(player => {
    totalBattingSkills = totalBattingSkills + player.batting;
    totalBowlingSkills = totalBowlingSkills + player.bowling;
  });
  averageBallingSkills = totalBowlingSkills / 40;
  averageBattingSkills = totalBattingSkills / 40;
  for (let i = 0; i < 1000000; i++) {
    const [teamA, teamB, teamC] = getRandomTeams(players);
    const difference = getDifference(teamA, teamB, teamC, averageBallingSkills, averageBattingSkills);
    if (minimumDifference > difference) {
      minimumDifference = difference;
      finalTeams = {
        teamA, teamB, teamC
      }
    }
  }
  console.log('A Team : ')
  console.log(finalTeams.teamA);
  console.log('B Team : ')
  console.log(finalTeams.teamB);
  console.log('C Team : ')
  console.log(finalTeams.teamC);
  console.log('Differece Score: ' + minimumDifference);
}
main ();