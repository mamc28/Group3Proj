/*
Object Structures (each of the functions below are in accordance with these strucures):

Card:
{
    id: string,           (a unique identifier for each card)
    front: string,        (the text on the front of the flashcard; eg. a question)
    back: string          (the text on the back of the flashcard; eg. an answer)
}

Cardset:
{
    id: string,           (a unique identifier for each Cardset)
    title: string,        (title/name of the Cardset)
    description: string,  (description of the Cardset)
    set: Card[]           (the actual array of Cards within the Cardset)
}
*/

//Global Functions:

//Create a new Card
export function createCard(front, back) {
    return {
        id: crypto.randomUUID(),
        front: front,
        back: back
    };
}

//Create a new Cardset
export function createCardset(title, description) {
    return {
        id: crypto.randomUUID(),
        title: title,
        description: description,
        cards: []
    };
}

//Add a card to the end of a Cardset
export function addCard(cardset, card) {
    cardset.cards.push(card);
}

//Insert a card into a Cardset
export function insertCard(cardset, card, index) {
    cardset.cards.splice(index, 0, card);
}

//Remove a card from a Cardset
export function removeCard(cardset, cardId) {
    const index = findCardIndex(cardset, cardId);

    if (index === -1) throw new Error("Card not found");

    cardset.cards.splice(index, 1);
}

//Reorder a Card in a Cardset to another position in that same Cardset
export function reorderCard(cardset, cardId, index) {
    const start = findCardIndex(cardset, cardId);

    if (start === -1) throw new Error("Card not found");

    const card = cardset.set.splice(start, 1)[0];  //remove & store card
    cardset.cards.splice(index, 0, card);  //insert card
}

//Update the front of a Card in a Cardset
export function updateCardFront(cardset, cardId, front) {
    const card = findCard(cardset, cardId);

    if (card === null) throw new Error("Card not found.");
    
    card.front = front;
}

//Update the back of a Card in a Cardset
export function updateCardBack(cardset, cardId, back) {
    const card = findCard(cardset, cardId);

    if (card === null) throw new Error("Card not found.");
    
    card.back = back;
}

//Returns the Card with cardId or null if that cardId isn't found within cardset
export function findCard(cardset, cardId) {
    return cardset.cards.find(card => card.id === cardId) ?? null;
}

//Returns a completely randomly shuffled version of the Cardset without changing the original
export function shuffleCardset(cardset) {
    const shuffled = [...cardset.cards];  //copy cardset.cards into shuffled so that the original isn't modified

    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));  //get a random index in the array between 0 & i
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; //swap the card at i with the card at j
    }

    return {  //return the shuffled copy of the array (the cards within shuffled still reference the original card objects)
        ...cardset,
        cards: shuffled
    }
}

//Local Functions:

//Returns the index of the Card with cardId or -1 if that cardId isn't found within cardset
function findCardIndex(cardset, cardId) {
    return cardset.cards.findIndex(card => card.id === cardId);
}