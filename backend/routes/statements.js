const router = require('express').Router();
const pool = require('../db');
const auth = require('../middleware/auth');
const validateStatement = require('../middleware/validateStatement');

// route to fetch most recent statement for the card with id = {id}
router.get('/', auth, async (req, res) => {
    try {
        const card_id = req.card_id;
        const card = await pool.query(`SELECT * FROM cards WHERE card_id = '${card_id}'`);
        if (card.rows.length === 0) {
            return res.status(404).send({ message: `No card with card_id '${card_id}' found` });
        }
        const cardStatements = await pool.query(`SELECT * FROM statements WHERE statement_card_id = '${card_id}' ORDER BY year DESC, month DESC LIMIT 1`);
        return res.status(200).send({ statement: cardStatements.rows[0] });
    } catch (err) {
        console.log(err);
        return res.status(500).send({ message: "Internal Server Error" });
    }
});

// route to post statements for cards
router.post('/:year/:month', validateStatement, async (req, res) => {
    try {
        const { net_amount, transactions } = req.body;
        const { month, year } = req.params;
        const statement_card_id = req.card_id;
        const card = await pool.query(`SELECT * FROM cards WHERE card_id = '${statement_card_id}'`);
        if (card.rows.length === 0) {
            return res.status(404).send({ message: "Invalid card id" });
        }
        // check if statement for the specified month already exists for the card
        const alreadyExists = await pool.query(`SELECT * FROM statements WHERE statement_card_id = '${statement_card_id}' AND month = '${req.params.month}' AND year = '${req.params.year}'`);
        if (alreadyExists.rows.length > 0) {
            return res.status(409).send({ message: "Statement for specified month already exists for the card" });
        }
        // insert statement into db
        const cardStatment = await pool.query(`INSERT INTO statements(month, year, net_amount, statement_card_id) VALUES(${month}, ${year}, ${net_amount}, '${statement_card_id}') RETURNING *`);
        const statement_id = cardStatment.rows[0].statement_id;
        // insert each transaction into db
        transactions.forEach(async (transaction) => {
            const { amount, type, vendor, category } = transaction;
            await pool.query(`INSERT INTO transactions(amount, type, vendor, category, transaction_statement_id) VALUES(${amount}, '${type}', '${vendor}', '${category}', '${statement_id}')`);
        });
        // update outstanding amount
        const currentOutstanding = await pool.query(`SELECT outstanding_amount FROM cards WHERE card_id = '${statement_card_id}'`);
        const newOutstanding = currentOutstanding.rows[0].outstanding_amount + net_amount;
        await pool.query(`UPDATE cards SET outstanding_amount = '${newOutstanding}' WHERE card_id = '${statement_card_id}'`);
        // send back statement id
        return res.status(201).send({ statement_id });
    } catch (err) {
        console.log(err.message);
        return res.status(500).send({ message: "Internal Server Error" });
    }
})

module.exports = router;