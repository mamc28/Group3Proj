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

//Create a new Card
export function createCard(front, back) {
    return {
        id: cryptio.randomUUID(),
        front: front,
        back: back
    };
}

//Create a new Cardset
export function createCardset(title, description) {
    return {
        id: cryptio.randomUUID(),
        title: title,
        description: description,
        set: []
    };
}

//Add a card to the end of a Cardset
export function addCard(cardset, card) {
    cardset.set.push(card);
}

//Insert a card into a Cardset
export function insertCard() {

}

//Remove a card from a Cardset
export function removeCard() {

}

//Reorder a Cardset
export function reorderCardset() {

}

//Update a Card in a Cardset
export function updateCard() {

}

