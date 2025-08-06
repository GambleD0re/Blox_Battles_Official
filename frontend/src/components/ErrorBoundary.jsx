import React from 'react';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        // Update state so the next render will show the fallback UI.
        return { hasError: true, error: error };
    }

    componentDidCatch(error, errorInfo) {
        // You can also log the error to an error reporting service
        console.error("Uncaught error in component:", error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            // You can render any custom fallback UI
            return (
                <div className="p-4 m-4 bg-red-900/50 border-2 border-red-700 rounded-lg text-center">
                    <h2 className="text-2xl font-bold text-red-300">Something went wrong.</h2>
                    <p className="text-red-400 mt-2">This part of the application has crashed. Please try refreshing the page.</p>
                    <pre className="mt-4 text-left text-xs bg-black p-2 rounded overflow-auto">
                        {this.state.error && this.state.error.toString()}
                    </pre>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
