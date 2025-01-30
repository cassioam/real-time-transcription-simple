// storyService.js

// Simulated API call (hard-coded for now).
export function getStoryById(storyId) {
    return {
      Id: storyId,
      Title: "Mia's Adventure",
      Pages: [
        {
          PageNumber: 1,
          Image: "forest_hero.jpg",
          Text: "Mia woke up early and ran outside to see the bright morning sun. She loved to explore the forest near her home, listening to birds and spotting little creatures. That day, she noticed a new path lined with shiny stones. She felt excited and a little nervous, but she followed the stones into the forest."
        },
        {
          PageNumber: 2,
          Image: "pond_hero.jpg",
          Text: "Soon, Mia found a hidden pond. It shimmered like a mirror, and tall trees stood guard around it. She saw a turtle resting on a log. Gently, she touched the turtle’s shell. It blinked and started walking toward a large rock. Mia felt a burst of curiosity and followed."
        },
        {
          PageNumber: 3,
          Image: "box_hero.jpg",
          Text: "Behind the rock, Mia discovered a small wooden box. Carefully, she opened it and found a note that read, “Always be kind and brave.” Mia smiled and tucked the note in her pocket. Heading home, she knew her forest adventure would not be her last, and she felt proud of her courage and kindness."
        }
      ]
    };
  }
  