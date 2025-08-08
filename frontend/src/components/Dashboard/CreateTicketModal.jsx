import React, from 'react';

const Modal = ({ children, isOpen, onClose, title }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4">
            <div className="widget w-full max-w-lg max-h-[90vh] flex flex-col relative">
                <header className="p-4 border-b border-gray-700 flex justify-between items-center flex-shrink-0">
                    <h2 className="text-xl font-bold text-gray-100">{title}</h2>
                    {onClose && <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">&times;</button>}
                </header>
                <div className="p-6 overflow-y-auto">{children}</div>
            </div>
        </div>
    );
};

const CreateTicketModal = ({ isOpen, onClose, onSubmit, isSubmitting }) => {
    const [subject, setSubject] = useState('');
    const [message, setMessage] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!subject.trim() || !message.trim()) return;
        onSubmit({ subject, message });
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Create Support Ticket">
            <form onSubmit={handleSubmit} className="space-y-4">
                <p className="text-sm text-gray-400">
                    Please provide as much detail as possible. A staff member will assist you in a private channel on our Discord server.
                </p>
                <div className="form-group">
                    <label htmlFor="ticket-subject" className="text-gray-300">Subject</label>
                    <select
                        id="ticket-subject"
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                        required
                        className="form-input"
                    >
                        <option value="" disabled>Select a category...</option>
                        <option value="Billing Issue">Billing Issue</option>
                        <option value="Technical Problem / Bug Report">Technical Problem / Bug Report</option>
                        <option value="Player Report">Player Report</option>
                        <option value="General Question">General Question</option>
                        <option value="Other">Other</option>
                    </select>
                </div>
                <div className="form-group">
                    <label htmlFor="ticket-message" className="text-gray-300">Message</label>
                    <textarea
                        id="ticket-message"
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        required
                        className="form-input !h-32"
                        placeholder="Describe your issue in detail here..."
                    />
                </div>
                <div className="modal-actions flex justify-end gap-4 pt-4 border-t border-gray-700">
                    <button type="button" onClick={onClose} className="btn btn-secondary">
                        Cancel
                    </button>
                    <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                        {isSubmitting ? 'Submitting...' : 'Submit Ticket'}
                    </button>
                </div>
            </form>
        </Modal>
    );
};

export default CreateTicketModal;
