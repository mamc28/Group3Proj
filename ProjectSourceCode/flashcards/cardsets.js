/*
cardsets: cardset[]  (the array of all the user's cards)
*/

//Global Functions:

//Appends a Cardset to cardsets
export function addCardset(cardsets, cardset) {
    cardsets.push(cardset);
}

//Removes a Cardset specified by cardsetId from cardsets
export function removeCardset(cardsets, cardsetId) {
    const index = findCardsetIndex(cardsets, cardsetId);

    if (index === -1) throw new Error("Card not found");

    cardsets.splice(index, 1);
}

//Returns the Cardset with cardsetId within cardsets or null if cardsetId isn't in cardsets
export function findCardset(cardsets, cardsetId) {
    return cardsets.find(cardset => cardset.id === cardsetId) ?? null;
}

//Changes the title of the Cardset with cardsetId within cardsets
export function updateCardsetTitle(cardsets, cardsetId, title) {
    const cardset = findCardset(cardsets, cardsetId);
    
    if (cardset === null) throw new Error("Card not found.");
        
    cardset.title = title;
}

//Changes the description of the Cardset with cardsetId within cardsets
export function updateCardsetDescription(cardsets, cardsetId, description) {
    const cardset = findCardset(cardsets, cardsetId);
    
    if (cardset === null) throw new Error("Card not found.");
        
    cardset.description = description;
}

//Local Functions:

//Returns the index of the Cardset with cardsetId in cardsets or -1 if that cardsetId isn't found within cardsets
function findCardsetIndex(cardsets, cardsetId) {
    return cardsets.findIndex(cardset => cardset.id === cardsetId);
}