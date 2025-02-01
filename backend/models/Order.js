const { Model } = require('objection');

class Order extends Model {

    static get tableName() {
        return 'orders'; // Corresponds to the table name in your database
    }
  
    static get relationMappings() {
        const Customer = require('./Customer');
        const CashierSession = require('./CashierSession');
        const User = require('./user');

        return {
            customer: {
                relation: Model.BelongsToOneRelation,
                modelClass: Customer,
                join: {
                    from: 'orders.customer_id',
                    to: 'customers.id',
                },
            },
            cashier: {
                relation: Model.BelongsToOneRelation,
                modelClass: User,
                join: {
                    from: 'orders.cashier_id',
                    to: 'users.id'
                }
            },
            session: {
                relation: Model.HasOneRelation,
                modelClass: CashierSession,
                join: {
                    from: 'orders.session_id',
                    to: 'cashier_sessions.id'
                }
            },
        };
    }
}

module.exports = Order;

