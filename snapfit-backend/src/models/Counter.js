const mongoose = require('mongoose');

// Named sequences (e.g. "receipt-2026"), bumped atomically so two requests can
// never get the same number.
const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
});

const Counter = mongoose.model('Counter', counterSchema);

// The next number in the sequence `name`, starting at 1.
Counter.next = async function next(name) {
  const bump = () => Counter.findOneAndUpdate({ _id: name }, { $inc: { seq: 1 } }, { new: true, upsert: true });
  try {
    return (await bump()).seq;
  } catch (err) {
    // Two first-ever bumps of a sequence can race to create it; the loser
    // simply bumps the one that now exists.
    if (err.code !== 11000) throw err;
    return (await bump()).seq;
  }
};

module.exports = Counter;
