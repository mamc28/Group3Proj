/*
Shuffles the cards in a Cardset so they can be shown in a random order.
Uses the Card and Cardset structures from cards.js.
*/

//Returns a new array with the Cardset's cards in random order.
//The original Cardset is not changed.
export function shuffleCards(cardset) {
    const cards = [...cardset.cards]; //copy so the original order is kept

    //Fisher-Yates shuffle: go from the end of the array to the start,
    //swapping each card with a random card at or before it.
    for (let i = cards.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [cards[i], cards[j]] = [cards[j], cards[i]];
    }

    return cards;
}